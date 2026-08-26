require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { GoogleGenAI } = require('@google/genai');
const mongoose = require('mongoose');
const cors = require('cors');
const Summary = require('../models/Summary');
const jwt = require('jsonwebtoken');

let pemData;
try {
  pemData = process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, '\n')
}
catch (err) {
  console.log('error reading the file: ', err);
}

const appId = process.env.GITHUB_APP_ID;

let installation_id;
let token;
async function getInstallationToken() {
  try {
    const nowInSeconds = Math.floor(Date.now() / 1000);

    const payload = {
      iat: nowInSeconds - 60,
      exp: nowInSeconds + (5 * 60),
      iss: appId
    };
    console.log(`generated payload: `, payload);

    console.log('Key starts correctly:', pemData.startsWith('-----BEGIN RSA PRIVATE KEY-----'));
    console.log('Key ends correctly:', pemData.trim().endsWith('-----END RSA PRIVATE KEY-----'));
    console.log('Key length:', pemData.length);

    const signedPayload = jwt.sign(payload, pemData, { algorithm: 'RS256' });
    const response = await axios.get('https://api.github.com/app', {
      headers: {
        'Authorization': `Bearer ${signedPayload}`,
        'Accept': 'application/vnd.github+json'
      }
    });
    console.log('App info from github: ', response.data);

    const result = await axios.get('https://api.github.com/app/installations', {
      headers: {
        'Authorization': `Bearer ${signedPayload}`,
        'Accept': 'application/vnd.github+json'
      }
    });
    installation_id = result.data[0].id;

    const newResponse = await axios.post(`https://api.github.com/app/installations/${installation_id}/access_tokens`, {}, {
      headers: {
        'Authorization': `Bearer ${signedPayload}`,
        'Accept': 'application/vnd.github+json'
      }
    });

    token = newResponse.data;
    console.log('Token: ', token);
    return token.token;
  }
  catch (err) {
    console.log('getInstallationToken failed:', err.response?.data || err.message);
    throw err;
  }
}

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('mongodb connected');
  })
  .catch(err => console.log('mongodb connection failed: ', err));

const githubParser = express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
});

const app = express();
app.use(cors());
app.use(githubParser);

const myToken = process.env.GITHUB_TOKEN;
app.get('/health', (req, res) => {
  res.status(200).send('status: OK');
});

const ai = new GoogleGenAI({});

app.post('/webhook', async (req, res) => {

  const githubSignature = req.headers['x-hub-signature-256'];

  if (!githubSignature) {
    return res.status(401).send('missing signature');
  }

  const expectedSignature = 'sha256=' + crypto.createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET)
    .update(req.rawBody || '')
    .digest('hex');

  const trustedBuffer = Buffer.from(expectedSignature, 'ascii');
  const receivedBuffer = Buffer.from(githubSignature, 'ascii');

  if (trustedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(trustedBuffer, receivedBuffer)) {
    return res.status(403).send('Invalid signature');
  }

  if (!req.body.pull_request || req.body.action !== 'opened') {
    console.log('ignoring non pr event');
    return res.send();
  }
  const prNumber = req.body.pull_request.number;
  const repoOwner = req.body.repository.owner.login;
  const repoName = req.body.repository.name;
  const prTitle = req.body.pull_request.title;

  const installationToken = await getInstallationToken();

  try {
    const response = await axios.get(`https://api.github.com/repos/${repoOwner}/${repoName}/pulls/${prNumber}`, {
      headers: {
        'Accept': 'application/vnd.github.v3.diff',
        'Authorization': `Bearer ${installationToken}`
      }
    });

    let diffText = response.data;

    const truncated = diffText.length > 10000;
    if (truncated)
      diffText = diffText.slice(0, 9900);

    if (diffText.length < 100) {
      console.log('diff too small, skipping');
      return res.send();
    }
    const prompt = `You are summarizing a GitHub pull request for a reviewer who hasn't read the code yet. Given the git diff below, write a concise, summary of what changed and why it likely matters. 

    Rules:
    - Skip trivial changes (formatting, whitespace, typos) unless that's the entire PR.
    - Focus on the "what" and "why," not a line-by-line restatement of the diff.
    - ${truncated ? '-Note: this diff was truncated due to size, so it may be incomplete. Mention in your summary that this PR is large and the summary may not cover every change.' : ''}
    Diff:

    ${diffText}`;

    const interaction = await ai.interactions.create({
      model: "gemini-3.5-flash",
      input: prompt
    });

    await axios.post(`https://api.github.com/repos/${repoOwner}/${repoName}/issues/${prNumber}/comments`, { body: interaction.output_text }, {
      headers: {
        'Authorization': `Bearer ${installationToken}`,
        'Accept': 'application/vnd.github+json'
      }
    });

    const newSummary = new Summary({
      repoName,
      prNumber,
      prTitle,
      summary: interaction.output_text
    });

    await newSummary.save();
    console.log('summary saved to db: ', newSummary);
  }
  catch (err) {
    console.log(err);
  }
  res.send();
});

app.get('/summaries', async (req, res) => {
  try {
    const summaries = await Summary.find();
    res.status(200).json(summaries);
  }
  catch (err) {
    console.log(err);
  }
});

app.listen(5000, () => {
  console.log('listening on port 5000');
});
