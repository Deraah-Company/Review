// Initialize a fresh demo installation from the bundled snapshot, then preserve its edits.
import {cpSync,copyFileSync,existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const destination=path.resolve(process.env.DATA_DIR||path.join(root,'data'));
const snapshot=path.join(root,'demo-data');
mkdirSync(destination,{recursive:true});
if(!existsSync(path.join(destination,'academy.sqlite'))){
 if(!existsSync(path.join(snapshot,'academy.sqlite')))throw Error('Bundled demo database is missing. Include the demo-data folder.');
 if(existsSync(path.join(snapshot,'uploads')))cpSync(path.join(snapshot,'uploads'),path.join(destination,'uploads'),{recursive:true});
 copyFileSync(path.join(snapshot,'academy.sqlite'),path.join(destination,'academy.sqlite'));
 console.log('Loaded the bundled Academy examples into the empty data directory.');
}
process.env.DATA_DIR=destination;
await import('../server.mjs');
