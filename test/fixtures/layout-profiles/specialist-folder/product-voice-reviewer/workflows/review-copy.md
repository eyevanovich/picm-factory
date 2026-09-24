```picm-specialist-first-run
{
  "version": 1,
  "inputs": [
    {
      "path": "source/product-copy.md",
      "availability": "per-run",
      "description": "Product copy supplied for this review"
    },
    {
      "path": "reference/tone-notes.md",
      "availability": "scaffolded",
      "description": "Reusable product voice notes"
    }
  ],
  "expectedArtifact": "review/copy-review.md",
  "review": {
    "requiresInspectEditApprove": true,
    "visibleUncertainty": ["unsupported claims", "open questions"]
  },
  "nextAction": {
    "source": "review/copy-review.md"
  }
}
```

# Review Copy Workflow

1. Identify the audience and intended action.
2. Flag unsupported or vague claims.
3. Suggest concise voice edits.
4. Return questions separately from edits.
