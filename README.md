# MindshardAPI

# Mindshard Studio

This repository contains the integrated Mindshard application, featuring a React-based frontend and a Python FastAPI backend for AI services.

## Setup Instructions

**Goal:** Get both the frontend UI and the Python backend server running successfully.

**Current Status:** The project structure has been updated, with frontend `components`, `hooks`, and `services` now consolidated under the `src/` directory for a cleaner frontend codebase.

### Prerequisites

Before you begin, ensure you have the following installed:

* **Git:** For cloning the repository.
* **Conda (Miniconda or Anaconda):** For managing the Python backend environment.
    * [Download Miniconda](https://docs.conda.io/en/latest/miniconda.html)
* **Node.js & npm (or Yarn):** For managing the React frontend dependencies.
    * [Download Node.js (includes npm)](https://nodejs.org/en/download/)
    * Alternatively, install [Yarn](https://classic.yarnpkg.com/en/docs/install/) if preferred.

### Steps to Get Started

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    cd mindshard-ui-advanced-prototype # Or whatever your project's root folder is named
    ```

2.  **Download the Large Language Model (LLM):**
    The core LLM is required for the backend to function and is *not* included in the repository due to its size.
    * [cite_start]Please download `Phi-3.1-mini-128k-instruct-Q4_K_M.gguf` [cite: 30, 746, 688, 1197] and place it in a `models/` directory in the project root.
    * If the `models/` directory does not exist, create it:
        ```bash
        mkdir -p models
        ```
    * Then, move the downloaded `.gguf` file into the `models/` directory.

3.  **Set up the Python Backend Environment:**
    This project uses Conda for environment management and `pip` for specific Python dependencies.

    * **Create the Conda Environment:**
        This step reads `environment.yml` and installs all specified Python packages. [cite_start]It may take some time. [cite: 32, 748, 690, 1199]
        ```bash
        conda env create -f environment.yml
        ```

    * **Activate the Environment:**
        You must activate this environment whenever you want to run the backend or any Python scripts from the project.
        ```bash
        conda activate mindshard-dev
        ```

    * **Install Remaining Python Dependencies:**
        The `pyproject.toml` defines additional dependencies installed via `pip`. The `-e .[dev]` installs the project in editable mode and includes development tools like `pytest`, `ruff`, and `black`.
        ```bash
        pip install -e ".[dev]"
        ```

4.  **Set up the Node.js Frontend Dependencies:**
    The frontend is a React application built with Vite.

    * **Install Node.js Packages:**
        This reads `package.json` and installs all necessary frontend libraries.
        ```bash
        npm install
        # Or if you prefer Yarn:
        # yarn install
        ```
    * **Install Monaco Editor (required for code editor panels):**
        This is a crucial dependency for several UI panels.
        ```bash
        npm install @monaco-editor/react monaco-editor
        # Or if you prefer Yarn:
        # yarn add @monaco-editor/react monaco-editor
        ```

### Running the Application

Once all dependencies are installed, you can start both the backend and frontend.

1.  **Start the Backend Server (in a dedicated terminal):**
    Open a new terminal, navigate to your project root, activate the Conda environment, and run the server.
    [cite_start]The `TOKENIZERS_PARALLELISM=false` environment variable is essential to prevent potential hangs during model loading. [cite: 33, 749, 691, 1200]
    ```bash
    conda activate mindshard-dev
    TOKENIZERS_PARALLELISM=false mindshard-api
    ```
    * Expected output: You should see "--- Lifespan: Startup complete. All services ready. ---" once the backend is fully initialized.
    * The backend will typically run on `http://localhost:8000`.

2.  **Start the Frontend Development Server (in a separate terminal):**
    Open another terminal, navigate to your project root, and start the Vite development server.
    ```bash
    npm run dev
    # Or if you prefer Yarn:
    # yarn dev
    ```
    * Expected output: Vite will indicate a local URL (e.g., `http://localhost:5173/`).
    * Open this URL in your web browser.

### Key Backend Information for Frontend Integration (For UI Builders)

* **Backend URL:** `http://localhost:8000`
* **API Key:** Check the `.env` file for `MIND_API_KEY`. [cite_start]The default is `42424242`. [cite: 35]
* **Primary Backend Endpoint:** Frontend interactions for LLM inference often go through `http://localhost:8000/api/orchestrator/execute`.
* **Services Module:** The `src/services/mindshardService.ts` file in the frontend contains mock implementations for all backend API calls. These need to be replaced with actual `fetch` requests to the corresponding backend endpoints.
* **Data Types:** Refer to `src/types.ts` for shared TypeScript interfaces defining data structures used across the frontend.


