      
# File: src/mindshard_backend/summarizer.py (FINAL ISOLATED PROCESS FIX)
import structlog
from typing import Optional
# We need multiprocessing and Process, Queue from it
import multiprocessing as mp
from multiprocessing import Process, Queue

# These imports are now only needed inside the target function
# from transformers import pipeline, Pipeline
# from sumy.parsers.plaintext import PlaintextParser
# from sumy.nlp.tokenizers import Tokenizer
# from sumy.summarizers.lsa import LsaSummarizer as ExtractiveSummarizer

from mindshard_backend.config import SummarizerSettings

log = structlog.get_logger(__name__)

class ModelInitializationError(Exception):
    """Custom exception raised when the summarization model fails to load."""
    pass

# --- This function will run in a separate, clean process ---
def _summarization_worker(
    queue: Queue,
    text: str,
    settings: SummarizerSettings,
    use_abstractive: bool,
    sentence_count: int = 3
):
    """
    This worker function is executed in a completely isolated child process.
    It loads the necessary models, performs one summarization, puts the result
    in the queue, and exits. This prevents any C-level library conflicts.
    """
    try:
        # Import heavy libraries *inside* the worker process
        from transformers import pipeline
        from sumy.parsers.plaintext import PlaintextParser
        from sumy.nlp.tokenizers import Tokenizer
        from sumy.summarizers.lsa import LsaSummarizer

        if use_abstractive:
            # Load the abstractive model
            abstractive_pipeline = pipeline("summarization", model=settings.model_name, device="cpu")
            result = abstractive_pipeline(
                text,
                min_length=settings.min_length,
                max_length=settings.max_length,
                truncation=True
            )
            summary = result[0]['summary_text']
        else:
            # Perform extractive summarization
            parser = PlaintextParser.from_string(text, Tokenizer("english"))
            summarizer = LsaSummarizer()
            summary_sentences = summarizer(parser.document, sentences_count=sentence_count)
            summary = " ".join(str(sentence) for sentence in summary_sentences)
        
        queue.put(summary)
    except Exception as e:
        # If anything goes wrong, put the exception in the queue to be re-raised
        queue.put(e)

class SummarizerService:
    """
    A robust service that performs summarization in an ISOLATED child process
    to prevent C-level library conflicts with the main LLM.
    """

    def __init__(self, settings: SummarizerSettings):
        self.settings = settings
        # We no longer load the pipeline in the main process
        log.info("SummarizerService initialized. Model will be loaded on-demand in a separate process.")

    def prime(self):
        # The prime method is now a no-op. It does nothing at startup.
        # This is critical to preventing the hang.
        log.info("SummarizerService.prime() is a no-op. Models are loaded in a child process.")
        pass

    def _run_in_process(self, text: str, use_abstractive: bool) -> str:
        # Use a multiprocessing context to ensure clean startup
        ctx = mp.get_context("spawn")
        q = ctx.Queue()
        
        p = ctx.Process(
            target=_summarization_worker,
            args=(q, text, self.settings, use_abstractive)
        )
        
        p.start()
        # Wait for the process to finish, with a timeout for safety
        result = q.get(timeout=60) 
        p.join(timeout=5)

        if isinstance(result, Exception):
            raise result # Re-raise any exception from the child process
        
        return result

    def summarize(self, text: str) -> str:
        """
        The main public method. Intelligently chooses the best summarization strategy
        and runs it in an isolated process.
        """
        if not text or not text.strip():
            log.warning("Summarizer called with empty or whitespace-only text.")
            return ""

        use_abstractive = len(text) >= self.settings.strategy_threshold

        try:
            log.info("Spawning isolated process for summarization.", use_abstractive=use_abstractive)
            return self._run_in_process(text, use_abstractive)
        except Exception as e:
            log.error("Summarization process failed, falling back to extractive.", error=str(e))
            # As a fallback, try the other method
            try:
                return self._run_in_process(text, use_abstractive=not use_abstractive)
            except Exception as fallback_e:
                log.error("Summarization fallback also failed.", error=str(fallback_e))
                return f"Error: Summarization failed. {fallback_e}"

    
