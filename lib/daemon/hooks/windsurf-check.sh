#!/usr/bin/env bash
# Windsurf post_write_code hook — agent-guardrails
# stdin: JSON with file_path, working_directory
# exit 2 + stderr → agent sees the error

INPUT=$(cat)
PROJECT_DIR=$(echo "$INPUT" | grep -o '"working_directory":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$PROJECT_DIR" ]; then PROJECT_DIR="$(pwd)"; fi

RESULT=$(agent-guardrails check --json 2>/dev/null)

echo "$RESULT" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    try{
      const j=JSON.parse(d);
      const e=(j.findings||[]).filter(f=>f.severity==='error');
      if(e.length>0){
        process.stderr.write('\n🛡️ Guardrails Check Report\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        e.forEach(f=>process.stderr.write('❌ ['+f.code+'] '+f.message+'\n'));
        process.stderr.write('━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        process.exit(2);
      }
      process.exit(0);
    }catch{process.exit(0)}
  })
"
