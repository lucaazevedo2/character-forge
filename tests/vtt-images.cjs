const assert=require('node:assert/strict');
(async()=>{const {imageInfo}=await import('../supabase/functions/vtt-assets/image-validation.ts');
const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);new DataView(png.buffer).setUint32(16,2500);new DataView(png.buffer).setUint32(20,1500);assert.deepEqual(imageInfo(png),{mime:'image/png',width:2500,height:1500});
new DataView(png.buffer).setUint32(16,9000);assert.throws(()=>imageInfo(png),/8000/);assert.throws(()=>imageInfo(new TextEncoder().encode('<svg><script>bad()</script></svg>')),/PNG/);assert.throws(()=>imageInfo(new Uint8Array(4)),/Invalid/);
const webp=new Uint8Array(30);webp.set(new TextEncoder().encode('RIFF'),0);webp.set(new TextEncoder().encode('WEBPVP8X'),8);webp[24]=63;webp[27]=127;assert.deepEqual(imageInfo(webp),{mime:'image/webp',width:64,height:128});
console.log('PASS image signatures, dimensions, WebP parsing, active SVG and oversized-image rejection.');})().catch(e=>{console.error(e);process.exitCode=1});
