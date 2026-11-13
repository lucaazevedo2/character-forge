const A=require('node:assert/strict'),G=require('../vtt/geometry');const s={grid:64,settings:{}};
for(const [n,cost]of [[1,5],[2,15],[3,20],[4,30]])A.equal(G.movementDistance(s,{x:0,y:0},{x:n*64,y:n*64}),cost);
A.equal(G.movementDistance(s,{x:256,y:256},{x:0,y:0}),30);A.equal(G.movementDistance(s,{x:0,y:0},{x:320,y:128}),30);A.equal(G.movementDistance(s,{x:0,y:0},{x:256,y:0}),20);A.equal(G.movementDistance(s,{x:0,y:0},{x:64,y:64},1),10);console.log('PASS alternating ruler diagonals, mixed/straight/reverse movement and continued diagonal count.');
