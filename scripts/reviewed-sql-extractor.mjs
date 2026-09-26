function asSource(sql){
  const source=String(sql??"");
  if(!source.trim())throw new Error("reviewed SQL source is empty");
  return source;
}

function uniqueMarkerStart(source,marker){
  const token=String(marker??"").trim();
  if(!token)throw new Error("reviewed SQL marker is empty");
  const start=source.indexOf(token);
  if(start<0)throw new Error(`reviewed SQL marker not found: ${token}`);
  if(source.indexOf(token,start+token.length)>=0)throw new Error(`reviewed SQL marker is not unique: ${token}`);
  return {token,start};
}

function firstTopLevelSemicolon(source,start){
  let quote=null;
  for(let i=start;i<source.length;i+=1){
    const ch=source[i];
    if(quote){
      if(ch===quote){
        if(source[i+1]===quote){i+=1;continue}
        quote=null;
      }
      continue;
    }
    if(ch==="'"||ch==='"'){quote=ch;continue}
    if(ch===';')return i;
  }
  return -1;
}

export function extractReviewedStatement(sql,marker){
  const source=asSource(sql);
  const {token,start}=uniqueMarkerStart(source,marker);
  const trigger=/^CREATE\s+TRIGGER\b/i.test(token);

  if(trigger){
    const nextCreate=source.indexOf("\nCREATE ",start+token.length);
    const boundary=nextCreate>=0?nextCreate:source.length;
    const block=source.slice(start,boundary).trim();
    const terminal=block.lastIndexOf("END;");
    if(terminal<0)throw new Error(`reviewed trigger has no terminal END;: ${token}`);
    const trailing=block.slice(terminal+4).trim();
    if(trailing&&!/^--/.test(trailing))throw new Error(`unexpected trailing SQL after trigger: ${token}`);
    const statement=block.slice(0,terminal+4).trim();
    if(!statement.startsWith(token))throw new Error(`reviewed trigger extraction drift: ${token}`);
    return statement;
  }

  const end=firstTopLevelSemicolon(source,start);
  if(end<0)throw new Error(`reviewed SQL statement has no terminal semicolon: ${token}`);
  const statement=source.slice(start,end+1).trim();
  if(!statement.startsWith(token))throw new Error(`reviewed SQL statement extraction drift: ${token}`);
  return statement;
}

export function extractReviewedStatements(sql,markers){
  if(!Array.isArray(markers)||!markers.length)throw new Error("reviewed SQL markers are required");
  const seen=new Set();
  return markers.map(marker=>{
    const token=String(marker??"").trim();
    if(seen.has(token))throw new Error(`duplicate reviewed SQL marker: ${token}`);
    seen.add(token);
    return extractReviewedStatement(sql,token);
  });
}
