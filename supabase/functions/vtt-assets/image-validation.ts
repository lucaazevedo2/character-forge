/** Signature and decoded-dimension validation, without trusting the supplied MIME. */
export function imageInfo(bytes:Uint8Array):{mime:string;width:number;height:number}{
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=bytes.length;
 if(n<16)throw Error('Invalid image');
 let mime='',width=0,height=0;
 if(n>=24&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&v.getUint32(4)===0x0d0a1a0a&&v.getUint32(8)===13&&v.getUint32(12)===0x49484452){mime='image/png';width=v.getUint32(16);height=v.getUint32(20)}
 else if(bytes[0]===255&&bytes[1]===216){
  let p=2;while(p+4<=n){if(bytes[p++]!==255)continue;while(bytes[p]===255)p++;const marker=bytes[p++];if(marker===0xda||marker===0xd9)break;if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;const len=v.getUint16(p);if(len<2||p+len>n)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&len>=7){height=v.getUint16(p+3);width=v.getUint16(p+5);mime='image/jpeg';break}p+=len}
 }else if(String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'){
  const type=String.fromCharCode(...bytes.slice(12,16));mime='image/webp';
  if(type==='VP8X'&&n>=30){width=1+bytes[24]+256*bytes[25]+65536*bytes[26];height=1+bytes[27]+256*bytes[28]+65536*bytes[29]}
  else if(type==='VP8 '&&n>=30&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){width=v.getUint16(26,true)&0x3fff;height=v.getUint16(28,true)&0x3fff}
  else if(type==='VP8L'&&n>=25&&bytes[20]===47){const b=v.getUint32(21,true);width=(b&0x3fff)+1;height=((b>>>14)&0x3fff)+1}
 }
 if(!mime||width<1||height<1||width>8000||height>8000||width*height>64000000)throw Error('Use a PNG, JPEG or WebP image up to 8000 × 8000 pixels');return {mime,width,height};
}
