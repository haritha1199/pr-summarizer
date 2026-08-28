PR Summarizer

A GitHub App that automatically summarizes pull requests using AI. When a PR is opened, it fetches the diff, generates a plain-English summary with Google Gemini, posts it as a comment, and saves it for viewing on a dashboard.

Live demo: https://vercel.com/haritha8/pr-summarizer

How it works

Webhook (verified via HMAC signature) → GitHub App auth (JWT → installation token) → fetch diff → summarize with Gemini → post as PR comment → save to MongoDB → view on React dashboard.

Tech stack

React · Node.js/Express · MongoDB · Google Gemini API · GitHub App (JWT auth) · backend deployed on Render · frontend deployed on Vercel

Setup
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev

Requires a backend .env with: MONGODB_URI, GEMINI_API_KEY, GITHUB_APP_ID, GITHUB_WEBHOOK_SECRET, GITHUB_PRIVATE_KEY (single-line, \n for line breaks).

For local webhook testing, tunnel your local server (e.g. ngrok) and point the GitHub App's webhook URL at it.
