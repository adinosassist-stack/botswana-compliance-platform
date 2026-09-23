export function splitSqliteMigrationStatements(sqlText){
  const source=String(sqlText||"");
  const statements=[];
  let buffer="";
  let word="";
  let inSingle=false,inDouble=false,inLineComment=false,inBlockComment=false;
  let triggerMode=false,triggerBodyStarted=false,beginDepth=0,caseDepth=0;
  const leadingKeywords=[];

  const reset=()=>{
    buffer="";word="";
    triggerMode=false;triggerBodyStarted=false;beginDepth=0;caseDepth=0;
    leadingKeywords.length=0;
  };

  const pushWord=()=>{
    if(!word)return;
    const token=word.toUpperCase();
    if(leadingKeywords.length<4)leadingKeywords.push(token);
    if(leadingKeywords[0]==="CREATE"&&leadingKeywords[1]==="TRIGGER")triggerMode=true;
    if(triggerMode){
      if(token==="BEGIN"){beginDepth+=1;triggerBodyStarted=true;}
      else if(token==="CASE"&&triggerBodyStarted){caseDepth+=1;}
      else if(token==="END"&&triggerBodyStarted){
        if(caseDepth>0)caseDepth-=1;
        else if(beginDepth>0)beginDepth-=1;
      }
    }
    word="";
  };

  const finishStatement=()=>{
    pushWord();
    const statement=buffer.trim();
    if(statement)statements.push(statement);
    reset();
  };

  for(let i=0;i<source.length;i+=1){
    const ch=source[i],next=source[i+1]||"";
    buffer+=ch;

    if(inLineComment){
      if(ch==="\n")inLineComment=false;
      continue;
    }
    if(inBlockComment){
      if(ch==="*"&&next==="/"){buffer+=next;i+=1;inBlockComment=false;}
      continue;
    }
    if(inSingle){
      if(ch==="'"&&next==="'"){buffer+=next;i+=1;continue;}
      if(ch==="'")inSingle=false;
      continue;
    }
    if(inDouble){
      if(ch==='"'&&next==='"'){buffer+=next;i+=1;continue;}
      if(ch==='"')inDouble=false;
      continue;
    }

    if(ch==="-"&&next==="-"){pushWord();buffer+=next;i+=1;inLineComment=true;continue;}
    if(ch==="/"&&next==="*"){pushWord();buffer+=next;i+=1;inBlockComment=true;continue;}
    if(ch==="'"){pushWord();inSingle=true;continue;}
    if(ch==='"'){pushWord();inDouble=true;continue;}

    if(/[A-Za-z_]/.test(ch)){word+=ch;continue;}
    pushWord();

    if(ch===";"){
      if(!triggerMode){
        finishStatement();
      }else if(triggerBodyStarted&&beginDepth===0&&caseDepth===0){
        finishStatement();
      }
    }
  }
  finishStatement();
  return statements;
}
