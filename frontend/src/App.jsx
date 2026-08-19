import { useState, useEffect } from 'react';
import axios from 'axios';

import './App.css'

function App() {
  const [summaries, setSummaries] = useState([]);

  useEffect(() => {
    async function fetchData() {
      const summary = await axios.get('http://localhost:5000/summaries');

      setSummaries(summary.data);
    }
    fetchData();
  }, []);
  console.log(summaries);

  return (
    <>
      <div className="app-header">&gt; pr-summarizer</div>
      <ul className="summary-list">
        {summaries.map((item) => (
          <li key={item._id} className="summary-card">
            <div className="summary-card-header">
              <span className="repo-name">{item.repoName}</span>
              <span className="pr-badge">#{item.prNumber}</span>
            </div>
            <h3 className="pr-title">{item.prTitle}</h3>
            <p className="summary-body">{item.summary}</p>
          </li>
        ))}
      </ul>
    </>
  )
}

export default App
