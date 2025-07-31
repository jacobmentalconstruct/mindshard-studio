      
#!/bin/bash

# This script finds and kills any process running on port 8000.

PORT=8000
echo "Searching for process on port $PORT..."

# lsof stands for "list open files". -t gives just the PID, -i selects by network connection.
PID=$(lsof -t -i:$PORT)

if [ -z "$PID" ]; then
  echo "No process found on port $PORT."
else
  echo "Process found with PID: $PID. Killing it now."
  kill -9 $PID
  echo "Process $PID killed."
fi

    
