#!/usr/bin/env node
// Thebe AI Android site-to-app association: READ-ONLY public preflight.
// No website or account mutations, no signing key access, and no customer data.
// An association match is not proof of full-screen runtime behavior on a tablet.
import {pathToFileURL} from 'node:url';

export const SITE = 'https://thebedesk.com';
export const ASSETLINKS = SITE + '/.well-known/assetlinks.json';
export const PACKAGE_NAME = 'com.thebedesk.ai';
const RELATION = 'delegate_permission/common.handle_all_urls';
const BYTE_LIMIT = 65536;

export function normalizeFingerprint(value) {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  const hex = upper.replaceAll(':', '');
  // A certificate SHA-256 fingerprint is 32 bytes of hexadecimal.
  if (!/^[0-9A-F]{64}$/.test(hex)) return null;
  if (upper.includes(':') && !/^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/.test(upper)) return null;
  if (/^0{64}$/.test(hex)) return null;
  return hex.match(/../g).join(':');
}

export function hasVerifiedAssociation(statements, fingerprint) {
  const expected = normalizeFingerprint(fingerprint);
  if (!expected || !Array.isArray(statements)) return false;
  return statements.some((statement) => {
    const target = statement?.target;
    if (!Array.isArray(statement?.relation) || !statement.relation.includes(RELATION)) return false;
    if (target?.namespace !== 'android_app' || target?.package_name !== PACKAGE_NAME) return false;
    if (!Array.isArray(target.sha256_cert_fingerprints)) return false;
    return target.sha256_cert_fingerprints.some((actual) => normalizeFingerprint(actual) === expected);
  });
}

export async function fetchPublicAssetlinks(fetchImpl = fetch) {
  const response = await fetchImpl(ASSETLINKS, {
    method: 'GET',
    redirect: 'manual', // An auth redirect, login screen, or other host is not Digital Asset Links evidence.
    credentials: 'omit',
    cache: 'no-store',
    headers: {'Accept': 'application/json'},
    signal: AbortSignal.timeout(10000),
  });
  if (response.status !== 200) throw new Error('expected public HTTP 200; received ' + response.status);
  const type = response.headers.get('content-type') || '';
  if (!/^(?:application\/json|application\/assetlinks\+json)(?:;|$)/i.test(type.trim())) {
    throw new Error('the association file is not served as JSON');
  }
  const declared = response.headers.get('content-length');
  if (declared && Number(declared) > BYTE_LIMIT) throw new Error('association file exceeds size limit');
  if (!response.body) throw new Error('association file response has no body');
  let size = 0;
  const parts = [];
  for await (const part of response.body) {
    size += part.byteLength;
    if (size > BYTE_LIMIT) throw new Error('association file exceeds size limit');
    parts.push(part);
  }
  let document;
  try {
    const bytes = new Uint8Array(size);
    let cursor = 0;
    for (const part of parts) {bytes.set(part,cursor); cursor += part.byteLength;}
    document = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  } catch {
    throw new Error('association file is not valid UTF-8 JSON');
  }
  if (!Array.isArray(document)) throw new Error('association file must be a JSON array');
  return document;
}

export async function run(argv = process.argv.slice(2), fetchImpl = fetch) {
  if (argv.includes('--help')) {
    process.stdout.write('Read-only Thebe AI Android origin audit. Optional: --fingerprint <verified-release-cert-SHA256>.\n');
    return 0;
  }
  if (argv.length !== 0 && (argv.length !== 2 || argv[0] !== '--fingerprint')) {
    process.stderr.write('BLOCKED: use no arguments or --fingerprint <verified-release-cert-SHA256>.\n');
    return 2;
  }
  const fingerprint = argv.length === 2 ? normalizeFingerprint(argv[1]) : null;
  if (argv.length === 2 && !fingerprint) {
    process.stderr.write('BLOCKED: invalid SHA-256 signing-certificate fingerprint.\n');
    return 2;
  }
  let statements;
  try {
    statements = await fetchPublicAssetlinks(fetchImpl);
  } catch (error) {
    // Do not print HTTP response bodies, account cookies, or arbitrary URLs.
    process.stderr.write('BLOCKED: public Digital Asset Links preflight failed (' +
      (error instanceof Error && /^(expected public HTTP 200; received \d+|the association file is not served as JSON|association file exceeds size limit|association file response has no body|association file is not valid UTF-8 JSON|association file must be a JSON array)$/.test(error.message)
        ? error.message : 'unavailable or network error') + ').\n');
    return 1;
  }
  if (!fingerprint) {
    process.stdout.write('BLOCKED: public assetlinks.json is present, but no verified release certificate was supplied.\n');
    return 2;
  }
  if (!hasVerifiedAssociation(statements, fingerprint)) {
    process.stdout.write('BLOCKED: public site-to-app statement does not match Thebe AI package and release certificate.\n');
    return 2;
  }
  process.stdout.write('MATCH: public statement contains the expected app package, relation, and certificate digest.\n');
  process.stdout.write('NOT VERIFIED: ownership/signing authority, device trust decision, real-browser rendering, voice, or physical tablet QA.\n');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run();
}
