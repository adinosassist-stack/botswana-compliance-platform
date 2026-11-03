import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectCreateOrder} from '../scripts/pop-staging-fk-order-diagnostic.mjs';
test('flags forward references without executing SQL',()=>{
 const result=inspectCreateOrder([
 {type:'table',name:'child',sql:'CREATE TABLE child(id TEXT, parent_id TEXT REFERENCES parent(id))'},
 {type:'table',name:'parent',sql:'CREATE TABLE parent(id TEXT PRIMARY KEY)'}]);
 assert.equal(result.forwardReferenceCount,1);
 assert.equal(result.firstIssue.table,'child');
 assert.equal(result.databaseWrites,false);
});
test('allows parent before child',()=>{
 const result=inspectCreateOrder([
 {type:'table',name:'parent',sql:'CREATE TABLE parent(id TEXT PRIMARY KEY)'},
 {type:'table',name:'child',sql:'CREATE TABLE child(parent_id TEXT REFERENCES parent(id))'}]);
 assert.equal(result.forwardReferenceCount,0);
});
