import fs from 'node:fs';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
export function verifyPng(path) {
 const data=fs.readFileSync(path);
 if(data.length<33||!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||data.toString('ascii',12,16)!=='IHDR') throw Error('Not a PNG with a valid IHDR; use a decoder for other formats');
 return {path,bytes:data.length,width:data.readUInt32BE(16),height:data.readUInt32BE(20),sha256:crypto.createHash('sha256').update(data).digest('hex')};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(verifyPng(process.argv[2]),null,2));
