#!/usr/bin/env bash
# Cursor afterFileEdit hook (Beta) — agent-guardrails
# stdin: JSON with file_path
# Note: Cursor afterFileEdit does NOT support agent feedback yet,
# but output appears in Hooks Output Channel

INPUT=$(cat)
PROJECT_DIR="$(pwd)"

agent-guardrails check --json 2>/dev/null | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    try{
      const j=JSON.parse(d);
      const errors=(j.findings||[]).filter(f=>f.severity==='error');
      const warns=(j.findings||[]).filter(f=>f.severity==='warning');
      if(errors.length>0||warns.length>0){
        console.log('🛡️ agent-guardrails check:');
        errors.forEach(f=>console.log('  ❌ ERROR: ['+f.code+'] '+f.message));
        warns.forEach(f=>console.log('  ⚠️  WARN: ['+f.code+'] '+f.message));
        if(errors.length>0) process.exit(1);
      }
    }catch{}
  })
"
