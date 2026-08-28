# FLOW deployment package

This package keeps the existing FLOW application intact.

For a Python web host such as Render:
- Build command: `pip install -r requirements.txt`
- Start command: `gunicorn --bind 0.0.0.0:$PORT app:app`

Important:
- Add the same environment variables/API keys used locally to the host's environment settings.
- Do not upload `.env` with secrets to a public repository.
- If the host reports that `app:app` cannot be imported, verify the Flask application object in `app.py`.
