#!/usr/bin/env node
// Strict read-only accessibility evidence check for the unauthenticated
// synthetic Android emulator. This is NOT a login or real-tablet test.
// Avoid printing captured UI content: even emulator UI evidence may change.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const LIMIT = 1024 * 1024;

function decodeAttribute(value) {
  return value.replace(/&#(?:x([0-9a-f]+)|([0-9]+));|&(?:quot|apos|lt|gt|amp);/gi, (whole,hex,dec) => {
    if (hex || dec) {
      const cp = Number.parseInt(hex || dec,hex ? 16 : 10);
      return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff
        ? String.fromCodePoint(cp) : whole;
    }
    return ({'&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&amp;':'&'})[whole.toLowerCase()] ?? whole;
  });
}

export function assessLoginHierarchy(xml) {
  if (typeof xml !== 'string' || xml.length===0 || xml.length>LIMIT || !/<hierarchy\b/.test(xml) || !/<node\b/.test(xml)) {
    return {status:'blocked', reason:'missing or invalid accessibility hierarchy'};
  }
  const labels = [];
  for (const tag of xml.matchAll(/<node\s+[^>]*>/g)) {
    for (const value of tag[0].matchAll(/\b(?:text|content-desc)="([^"]*)"/g)) {
      if(value[1]) labels.push(decodeAttribute(value[1]));
    }
  }
  const visible = labels.join(' ').replace(/\s+/g,' ').trim();
  if (!visible) return {status:'blocked',reason:'no visible accessibility labels'};
  if (/\b(?:Web page not available|This site can.t be reached|ERR_(?:NAME_NOT_RESOLVED|CONNECTION|INTERNET)|No internet connection|Choose an app|No browser found)\b/i.test(visible)) {
    return {status:'blocked',reason:'browser error or chooser visible'};
  }
  const hasBrand = /\bThebe Desk\b/i.test(visible);
  const hasAuth = /\b(?:Open your Thebe Desk workspace|Business name|Forgot password\??|One intelligent desk for the whole business)\b/i.test(visible);
  if (!hasBrand || !hasAuth) {
    return {status:'blocked',reason:hasBrand ? 'authentication markers not visible' : 'Thebe Desk branding not visible'};
  }
  return {status:'pass',reason:'Thebe Desk branding and distinctive sign-in content visible'};
}

export function run(args=process.argv.slice(2)) {
  if (args.length!==1) {
    process.stderr.write('BLOCKED: expected one local UIAutomator XML file.\n');
    return 2;
  }
  let xml;
  try {
    const stats=fs.statSync(args[0]);
    if (!stats.isFile() || stats.size===0 || stats.size>LIMIT) throw new Error('invalid XML size');
    xml=fs.readFileSync(args[0],'utf8');
  } catch {
    process.stderr.write('BLOCKED: inaccessible or oversized local UI evidence.\n');
    return 2;
  }
  const result=assessLoginHierarchy(xml);
  if(result.status!=='pass') {
    process.stderr.write('BLOCKED: '+result.reason+'.\n');
    return 1;
  }
  process.stdout.write('PASS: synthetic Android emulator shows Thebe Desk sign-in markers.\n');
  process.stdout.write('NOT VERIFIED: authenticated workspace, login success, voice, physical tablet, or trusted fullscreen.\n');
  return 0;
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  process.exitCode=run();
}
