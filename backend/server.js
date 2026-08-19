require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');
const mongoose = require('mongoose');
const cors = require('cors');
const Summary = require('../models/Summary')

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('mongodb connected');
  })
  .catch(err => console.log('mongodb connection failed: ', err));


const app = express();
app.use(express.json());
app.use(cors());

const myToken = process.env.GITHUB_TOKEN;
app.get('/health', (req, res) => {
  res.status(200).send('status: OK');
});

const ai = new GoogleGenAI({});

app.post('/webhook', async (req, res) => {
  if (!req.body.pull_request || req.body.action !== 'opened') {
    console.log('ignoring non pr event');
    return res.send();
  }
  const prNumber = req.body.pull_request.number;
  const repoOwner = req.body.repository.owner.login;
  const repoName = req.body.repository.name;
  const prTitle = req.body.pull_request.title;

  try {
    const response = await axios.get(`https://api.github.com/repos/${repoOwner}/${repoName}/pulls/${prNumber}`, {
      headers: {
        'Accept': 'application/vnd.github.v3.diff',
        'Authorization': `token ${myToken}`
      }
    });

    let diffText = response.data;

    const truncated = diffText.length>10000;
    if(truncated)
      diffText = diffText.slice(0, 9900);
    
    if(diffText.length<100)
    {
      console.log('diff too small, skipping');
      return res.send();
    }
    const prompt = `You are summarizing a GitHub pull request for a reviewer who hasn't read the code yet. Given the git diff below, write a concise, summary of what changed and why it likely matters. 

    Rules:
    - Skip trivial changes (formatting, whitespace, typos) unless that's the entire PR.
    - Focus on the "what" and "why," not a line-by-line restatement of the diff.
    - ${truncated ? '-Note: this diff was truncated due to size, so it may be incomplete. Mention in your summary that this PR is large and the summary may not cover every change.' :''}
    Diff:

    ${diffText}`;

    const interaction = await ai.interactions.create({
      model: "gemini-3.5-flash",
      input: prompt
    });

    await axios.post(`https://api.github.com/repos/${repoOwner}/${repoName}/issues/${prNumber}/comments`, { body: interaction.output_text }, {
      headers: {
        'Authorization': `token ${myToken}`,
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
