#!/usr/bin/env node
// Generate 16 PDF templates with large orange icons at 30% opacity
// 20 icons per page, overlapping, shared icons between themes
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

// 45% orange on white (clearly visible)
const O = 0.45;
const IC = rgb(1 - O * (1 - 0.91), 1 - O * (1 - 0.365), 1 - O * (1 - 0.149));
const W = rgb(1, 1, 1);
const PW = 595.28; // A4
const PH = 841.89;

// ═══════════════════════════════════════════════════════════
// SHARED ICON LIBRARY — reusable across themes
// Each: (page, x, y, s) draws at center (x,y) with size s
// ═══════════════════════════════════════════════════════════
const I = {
  // ── TOOLS / HANDWERK ──
  hammer: (p,x,y,s) => { p.drawRectangle({x:x-s*.05,y:y-s*.35,width:s*.1,height:s*.55,color:IC}); p.drawRectangle({x:x-s*.25,y:y+s*.15,width:s*.5,height:s*.15,color:IC}); },
  wrench: (p,x,y,s) => { p.drawRectangle({x:x-s*.04,y:y-s*.35,width:s*.08,height:s*.7,color:IC}); p.drawCircle({x,y:y+s*.3,size:s*.15,color:IC}); },
  screwdriver: (p,x,y,s) => { p.drawRectangle({x:x-s*.04,y:y-s*.3,width:s*.08,height:s*.45,color:IC}); p.drawRectangle({x:x-s*.08,y:y-s*.3,width:s*.16,height:s*.12,color:IC}); p.drawRectangle({x:x-s*.02,y:y+s*.15,width:s*.04,height:s*.2,color:IC}); },
  gear: (p,x,y,s) => { p.drawCircle({x,y,size:s*.22,color:IC}); p.drawCircle({x,y,size:s*.12,color:W}); for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2; p.drawRectangle({x:x+Math.cos(a)*s*.24-s*.05,y:y+Math.sin(a)*s*.24-s*.05,width:s*.1,height:s*.1,color:IC});} },
  ruler: (p,x,y,s) => { p.drawRectangle({x:x-s*.35,y:y-s*.06,width:s*.7,height:s*.14,color:IC}); for(let i=0;i<7;i++) p.drawRectangle({x:x-s*.3+i*s*.1,y:y+s*.08,width:s*.03,height:i%2===0?s*.1:s*.06,color:IC}); },
  paintRoller: (p,x,y,s) => { p.drawRectangle({x:x-s*.2,y:y+s*.1,width:s*.4,height:s*.12,color:IC}); p.drawRectangle({x:x+s*.15,y:y-s*.1,width:s*.05,height:s*.2,color:IC}); p.drawRectangle({x:x+s*.12,y:y-s*.3,width:s*.08,height:s*.2,color:IC}); },
  saw: (p,x,y,s) => { p.drawRectangle({x:x-s*.3,y:y-s*.06,width:s*.6,height:s*.1,color:IC}); p.drawRectangle({x:x+s*.2,y:y-s*.06,width:s*.1,height:s*.25,color:IC}); for(let i=0;i<5;i++) p.drawRectangle({x:x-s*.25+i*s*.1,y:y+s*.04,width:s*.06,height:s*.08,color:IC}); },
  bolt: (p,x,y,s) => { p.drawCircle({x,y,size:s*.15,color:IC}); p.drawCircle({x,y,size:s*.08,color:W}); p.drawRectangle({x:x-s*.02,y:y-s*.3,width:s*.04,height:s*.15,color:IC}); },
  pliers: (p,x,y,s) => { p.drawRectangle({x:x-s*.1,y:y-s*.3,width:s*.06,height:s*.35,color:IC}); p.drawRectangle({x:x+s*.04,y:y-s*.3,width:s*.06,height:s*.35,color:IC}); p.drawCircle({x,y:y+s*.05,size:s*.1,color:IC}); p.drawRectangle({x:x-s*.12,y:y+s*.1,width:s*.1,height:s*.15,color:IC}); p.drawRectangle({x:x+s*.02,y:y+s*.1,width:s*.1,height:s*.15,color:IC}); },
  hardhat: (p,x,y,s) => { p.drawCircle({x,y:y+s*.05,size:s*.2,color:IC}); p.drawRectangle({x:x-s*.25,y:y-s*.1,width:s*.5,height:s*.08,color:IC}); },

  // ── BUSINESS / SELBSTÄNDIGKEIT ──
  lightbulb: (p,x,y,s) => { p.drawCircle({x,y:y+s*.1,size:s*.2,color:IC}); p.drawRectangle({x:x-s*.08,y:y-s*.2,width:s*.16,height:s*.15,color:IC}); p.drawRectangle({x:x-s*.06,y:y-s*.25,width:s*.12,height:s*.04,color:IC}); },
  briefcase: (p,x,y,s) => { p.drawRectangle({x:x-s*.25,y:y-s*.15,width:s*.5,height:s*.3,color:IC}); p.drawRectangle({x:x-s*.1,y:y+s*.15,width:s*.2,height:s*.1,color:IC}); },
  rocket: (p,x,y,s) => { p.drawRectangle({x:x-s*.07,y:y-s*.2,width:s*.14,height:s*.5,color:IC}); p.drawCircle({x,y:y+s*.28,size:s*.09,color:IC}); p.drawRectangle({x:x-s*.18,y:y-s*.2,width:s*.12,height:s*.15,color:IC}); p.drawRectangle({x:x+s*.06,y:y-s*.2,width:s*.12,height:s*.15,color:IC}); },
  target: (p,x,y,s) => { p.drawCircle({x,y,size:s*.28,color:IC}); p.drawCircle({x,y,size:s*.22,color:W}); p.drawCircle({x,y,size:s*.18,color:IC}); p.drawCircle({x,y,size:s*.1,color:W}); p.drawCircle({x,y,size:s*.07,color:IC}); },
  chartUp: (p,x,y,s) => { p.drawRectangle({x:x-s*.3,y:y-s*.25,width:s*.12,height:s*.2,color:IC}); p.drawRectangle({x:x-s*.12,y:y-s*.25,width:s*.12,height:s*.35,color:IC}); p.drawRectangle({x:x+s*.06,y:y-s*.25,width:s*.12,height:s*.25,color:IC}); p.drawRectangle({x:x+s*.24,y:y-s*.25,width:s*.12,height:s*.5,color:IC}); },
  key: (p,x,y,s) => { p.drawCircle({x:x-s*.15,y,size:s*.14,color:IC}); p.drawCircle({x:x-s*.15,y,size:s*.07,color:W}); p.drawRectangle({x:x-s*.03,y:y-s*.03,width:s*.35,height:s*.06,color:IC}); p.drawRectangle({x:x+s*.22,y:y-s*.12,width:s*.06,height:s*.12,color:IC}); p.drawRectangle({x:x+s*.14,y:y-s*.1,width:s*.05,height:s*.1,color:IC}); },
  handshake: (p,x,y,s) => { p.drawRectangle({x:x-s*.3,y:y-s*.05,width:s*.28,height:s*.1,color:IC}); p.drawRectangle({x:x+s*.02,y:y-s*.05,width:s*.28,height:s*.1,color:IC}); p.drawCircle({x,y,size:s*.1,color:IC}); },
  plant: (p,x,y,s) => { p.drawRectangle({x:x-s*.1,y:y-s*.25,width:s*.2,height:s*.2,color:IC}); p.drawRectangle({x:x-s*.02,y:y-s*.05,width:s*.04,height:s*.25,color:IC}); p.drawCircle({x:x-s*.08,y:y+s*.15,size:s*.06,color:IC}); p.drawCircle({x:x+s*.08,y:y+s*.2,size:s*.06,color:IC}); p.drawCircle({x,y:y+s*.25,size:s*.07,color:IC}); },
  trophy: (p,x,y,s) => { p.drawRectangle({x:x-s*.14,y:y,width:s*.28,height:s*.28,color:IC}); p.drawRectangle({x:x-s*.05,y:y-s*.12,width:s*.1,height:s*.12,color:IC}); p.drawRectangle({x:x-s*.12,y:y-s*.18,width:s*.24,height:s*.06,color:IC}); p.drawRectangle({x:x-s*.22,y:y+s*.08,width:s*.1,height:s*.12,color:IC}); p.drawRectangle({x:x+s*.12,y:y+s*.08,width:s*.1,height:s*.12,color:IC}); },
  diamond: (p,x,y,s) => { p.drawRectangle({x:x-s*.15,y:y-s*.05,width:s*.3,height:s*.25,color:IC}); p.drawRectangle({x:x-s*.08,y:y+s*.2,width:s*.16,height:s*.1,color:IC}); p.drawRectangle({x:x-s*.08,y:y-s*.15,width:s*.16,height:s*.1,color:IC}); },

  // ── LEADERSHIP ──
  crown: (p,x,y,s) => { p.drawRectangle({x:x-s*.28,y:y-s*.12,width:s*.56,height:s*.18,color:IC}); p.drawRectangle({x:x-s*.28,y:y+s*.06,width:s*.12,height:s*.18,color:IC}); p.drawRectangle({x:x-s*.06,y:y+s*.06,width:s*.12,height:s*.24,color:IC}); p.drawRectangle({x:x+s*.16,y:y+s*.06,width:s*.12,height:s*.18,color:IC}); },
  chessKing: (p,x,y,s) => { p.drawRectangle({x:x-s*.18,y:y-s*.28,width:s*.36,height:s*.1,color:IC}); p.drawRectangle({x:x-s*.1,y:y-s*.18,width:s*.2,height:s*.38,color:IC}); p.drawRectangle({x:x-s*.04,y:y+s*.2,width:s*.08,height:s*.14,color:IC}); p.drawRectangle({x:x-s*.1,y:y+s*.26,width:s*.2,height:s*.05,color:IC}); },
  podium: (p,x,y,s) => { p.drawRectangle({x:x-s*.12,y:y-s*.05,width:s*.24,height:s*.4,color:IC}); p.drawRectangle({x:x-s*.35,y:y-s*.15,width:s*.22,height:s*.28,color:IC}); p.drawRectangle({x:x+s*.13,y:y-s*.25,width:s*.22,height:s*.18,color:IC}); },
  compass: (p,x,y,s) => { p.drawCircle({x,y,size:s*.28,color:IC}); p.drawCircle({x,y,size:s*.22,color:W}); p.drawRectangle({x:x-s*.025,y,width:s*.05,height:s*.2,color:IC}); p.drawRectangle({x,y:y-s*.025,width:s*.2,height:s*.05,color:IC}); p.drawCircle({x,y,size:s*.04,color:IC}); },
  star: (p,x,y,s) => { for(let i=0;i<5;i++){const a=(i*72-90)*Math.PI/180; p.drawRectangle({x:x+Math.cos(a)*s*.22-s*.04,y:y+Math.sin(a)*s*.22-s*.04,width:s*.08,height:s*.08,color:IC});} p.drawCircle({x,y,size:s*.14,color:IC}); },
  flag: (p,x,y,s) => { p.drawRectangle({x:x-s*.22,y:y-s*.3,width:s*.04,height:s*.6,color:IC}); p.drawRectangle({x:x-s*.18,y:y+s*.05,width:s*.38,height:s*.22,color:IC}); },

  // ── FINANCE / ACCOUNTING ──
  calculator: (p,x,y,s) => { p.drawRectangle({x:x-s*.22,y:y-s*.32,width:s*.44,height:s*.64,color:IC}); p.drawRectangle({x:x-s*.15,y:y+s*.12,width:s*.3,height:s*.12,color:W}); for(let r=0;r<3;r++) for(let c=0;c<3;c++) p.drawRectangle({x:x-s*.14+c*s*.1,y:y-s*.22+r*s*.1,width:s*.07,height:s*.07,color:W}); },
  receipt: (p,x,y,s) => { p.drawRectangle({x:x-s*.16,y:y-s*.32,width:s*.32,height:s*.64,color:IC}); for(let i=0;i<5;i++) p.drawRectangle({x:x-s*.09,y:y+s*.18-i*s*.1,width:s*.18,height:s*.03,color:W}); },
  pieChart: (p,x,y,s) => { p.drawCircle({x,y,size:s*.25,color:IC}); p.drawRectangle({x,y,width:s*.27,height:s*.015,color:W}); p.drawRectangle({x:x-s*.008,y,width:s*.015,height:s*.27,color:W}); },
  folder: (p,x,y,s) => { p.drawRectangle({x:x-s*.28,y:y-s*.18,width:s*.56,height:s*.34,color:IC}); p.drawRectangle({x:x-s*.28,y:y+s*.16,width:s*.22,height:s*.1,color:IC}); },
  clipboard: (p,x,y,s) => { p.drawRectangle({x:x-s*.22,y:y-s*.32,width:s*.44,height:s*.64,color:IC}); p.drawRectangle({x:x-s*.1,y:y+s*.28,width:s*.2,height:s*.1,color:IC}); for(let i=0;i<4;i++) p.drawRectangle({x:x-s*.12,y:y+s*.08-i*s*.12,width:s*.24,height:s*.04,color:W}); },
  coins: (p,x,y,s) => { p.drawCircle({x:x-s*.08,y:y-s*.05,size:s*.16,color:IC}); p.drawCircle({x:x+s*.1,y:y+s*.08,size:s*.16,color:IC}); },

  // ── CURRENCIES ──
  chf: (p,x,y,s) => { p.drawRectangle({x:x-s*.05,y:y-s*.28,width:s*.1,height:s*.56,color:IC}); p.drawRectangle({x:x-s*.05,y:y+s*.16,width:s*.22,height:s*.08,color:IC}); p.drawRectangle({x:x-s*.14,y:y+s*.02,width:s*.22,height:s*.08,color:IC}); p.drawRectangle({x:x-s*.05,y:y-s*.28,width:s*.24,height:s*.08,color:IC}); },
  euro: (p,x,y,s) => { p.drawCircle({x:x+s*.02,y,size:s*.22,color:IC}); p.drawCircle({x:x+s*.02,y,size:s*.14,color:W}); p.drawRectangle({x:x-s*.2,y:y+s*.02,width:s*.25,height:s*.05,color:IC}); p.drawRectangle({x:x-s*.2,y:y-s*.07,width:s*.22,height:s*.05,color:IC}); p.drawRectangle({x:x-s*.05,y:y-s*.08,width:s*.18,height:s*.16,color:W}); },
  dollar: (p,x,y,s) => { p.drawRectangle({x:x-s*.03,y:y-s*.32,width:s*.06,height:s*.64,color:IC}); p.drawRectangle({x:x-s*.14,y:y+s*.1,width:s*.28,height:s*.08,color:IC}); p.drawRectangle({x:x-s*.14,y:y-s*.03,width:s*.28,height:s*.08,color:IC}); p.drawRectangle({x:x-s*.14,y:y-s*.16,width:s*.28,height:s*.08,color:IC}); },
  yen: (p,x,y,s) => { p.drawRectangle({x:x-s*.03,y:y-s*.28,width:s*.06,height:s*.35,color:IC}); p.drawRectangle({x:x-s*.18,y:y+s*.15,width:s*.14,height:s*.08,color:IC}); p.drawRectangle({x:x+s*.04,y:y+s*.15,width:s*.14,height:s*.08,color:IC}); p.drawRectangle({x:x-s*.14,y:y+s*.02,width:s*.28,height:s*.05,color:IC}); p.drawRectangle({x:x-s*.12,y:y-s*.06,width:s*.24,height:s*.05,color:IC}); },
  pound: (p,x,y,s) => { p.drawRectangle({x:x-s*.1,y:y-s*.28,width:s*.06,height:s*.56,color:IC}); p.drawRectangle({x:x-s*.1,y:y+s*.2,width:s*.24,height:s*.08,color:IC}); p.drawRectangle({x:x-s*.18,y:y,width:s*.24,height:s*.06,color:IC}); p.drawRectangle({x:x-s*.1,y:y-s*.28,width:s*.24,height:s*.08,color:IC}); },
  bitcoin: (p,x,y,s) => { p.drawCircle({x,y,size:s*.28,color:IC}); p.drawRectangle({x:x-s*.08,y:y-s*.18,width:s*.05,height:s*.36,color:W}); p.drawRectangle({x:x-s*.03,y:y+s*.06,width:s*.12,height:s*.07,color:W}); p.drawRectangle({x:x-s*.03,y:y-s*.12,width:s*.12,height:s*.07,color:W}); },

  // ── STOCKS / MARKETS ──
  candlestick: (p,x,y,s) => { p.drawRectangle({x:x-s*.08,y:y-s*.1,width:s*.16,height:s*.32,color:IC}); p.drawRectangle({x:x-s*.02,y:y-s*.3,width:s*.04,height:s*.7,color:IC}); },
  bull: (p,x,y,s) => { p.drawCircle({x,y,size:s*.2,color:IC}); p.drawRectangle({x:x-s*.25,y:y+s*.14,width:s*.1,height:s*.18,color:IC}); p.drawRectangle({x:x+s*.15,y:y+s*.14,width:s*.1,height:s*.18,color:IC}); },
  barChart: (p,x,y,s) => { p.drawRectangle({x:x-s*.28,y:y-s*.22,width:s*.14,height:s*.22,color:IC}); p.drawRectangle({x:x-s*.07,y:y-s*.22,width:s*.14,height:s*.38,color:IC}); p.drawRectangle({x:x+s*.14,y:y-s*.22,width:s*.14,height:s*.55,color:IC}); },
  building: (p,x,y,s) => { p.drawRectangle({x:x-s*.22,y:y-s*.25,width:s*.44,height:s*.42,color:IC}); p.drawRectangle({x:x-s*.28,y:y+s*.17,width:s*.56,height:s*.08,color:IC}); for(let i=0;i<3;i++) p.drawRectangle({x:x-s*.15+i*s*.12,y:y-s*.2,width:s*.04,height:s*.38,color:W}); },
  lineChart: (p,x,y,s) => { p.drawRectangle({x:x-s*.3,y:y-s*.25,width:s*.03,height:s*.5,color:IC}); p.drawRectangle({x:x-s*.3,y:y-s*.25,width:s*.6,height:s*.03,color:IC}); const st=[0,.12,.08,.22,.18,.32,.38]; for(let i=0;i<st.length;i++) p.drawCircle({x:x-s*.25+i*s*.09,y:y-s*.18+st[i]*s,size:s*.04,color:IC}); },

  // ── CRYPTO ──
  chainLink: (p,x,y,s) => { p.drawRectangle({x:x-s*.28,y:y-s*.07,width:s*.22,height:s*.14,color:IC}); p.drawRectangle({x:x+s*.06,y:y-s*.07,width:s*.22,height:s*.14,color:IC}); p.drawRectangle({x:x-s*.06,y:y-s*.04,width:s*.12,height:s*.08,color:IC}); },
  block: (p,x,y,s) => { p.drawRectangle({x:x-s*.18,y:y-s*.18,width:s*.36,height:s*.36,color:IC}); p.drawRectangle({x:x-s*.1,y:y+s*.18,width:s*.28,height:s*.1,color:IC}); },
  nodeNetwork: (p,x,y,s) => { p.drawCircle({x,y,size:s*.08,color:IC}); const ps=[[.22,.16],[-.22,.12],[.16,-.22],[-.16,-.18],[0,.28],[.25,-.05],[-.25,-.05]]; ps.forEach(([dx,dy])=>{p.drawCircle({x:x+dx*s,y:y+dy*s,size:s*.05,color:IC}); p.drawRectangle({x:x-s*.01,y:y-s*.01,width:Math.abs(dx)*s,height:s*.02,color:IC});}); },
  shield: (p,x,y,s) => { p.drawRectangle({x:x-s*.2,y:y-s*.08,width:s*.4,height:s*.38,color:IC}); p.drawCircle({x,y:y-s*.08,size:s*.2,color:IC}); },
  ethereum: (p,x,y,s) => { p.drawRectangle({x:x-s*.16,y:y-s*.06,width:s*.32,height:s*.28,color:IC}); p.drawRectangle({x:x-s*.09,y:y+s*.22,width:s*.18,height:s*.12,color:IC}); p.drawRectangle({x:x-s*.09,y:y-s*.18,width:s*.18,height:s*.12,color:IC}); },
  lock: (p,x,y,s) => { p.drawRectangle({x:x-s*.16,y:y-s*.22,width:s*.32,height:s*.28,color:IC}); p.drawCircle({x,y:y+s*.12,size:s*.14,color:IC}); p.drawCircle({x,y:y+s*.12,size:s*.08,color:W}); },
  wallet: (p,x,y,s) => { p.drawRectangle({x:x-s*.25,y:y-s*.15,width:s*.5,height:s*.3,color:IC}); p.drawRectangle({x:x+s*.1,y:y-s*.05,width:s*.18,height:s*.12,color:W}); p.drawCircle({x:x+s*.2,y:y+s*.01,size:s*.03,color:IC}); },

  // ── ECONOMICS ──
  globe: (p,x,y,s) => { p.drawCircle({x,y,size:s*.28,color:IC}); p.drawCircle({x,y,size:s*.22,color:W}); p.drawCircle({x,y,size:s*.2,color:IC}); p.drawRectangle({x:x-s*.3,y:y-s*.02,width:s*.6,height:s*.04,color:W}); p.drawRectangle({x:x-s*.02,y:y-s*.3,width:s*.04,height:s*.6,color:W}); },
  bank: (p,x,y,s) => { p.drawRectangle({x:x-s*.28,y:y-s*.22,width:s*.56,height:s*.38,color:IC}); p.drawRectangle({x:x-s*.32,y:y+s*.16,width:s*.64,height:s*.08,color:IC}); p.drawRectangle({x:x-s*.16,y:y+s*.24,width:s*.32,height:s*.08,color:IC}); },
  scale: (p,x,y,s) => { p.drawRectangle({x:x-s*.02,y:y-s*.28,width:s*.04,height:s*.45,color:IC}); p.drawRectangle({x:x-s*.28,y:y+s*.14,width:s*.56,height:s*.04,color:IC}); p.drawRectangle({x:x-s*.32,y:y+s*.02,width:s*.16,height:s*.1,color:IC}); p.drawRectangle({x:x+s*.16,y:y+s*.06,width:s*.16,height:s*.1,color:IC}); },
  percent: (p,x,y,s) => { p.drawCircle({x:x-s*.12,y:y+s*.12,size:s*.1,color:IC}); p.drawCircle({x:x+s*.12,y:y-s*.12,size:s*.1,color:IC}); p.drawRectangle({x:x-s*.03,y:y-s*.22,width:s*.06,height:s*.44,color:IC}); },
  arrowExchange: (p,x,y,s) => { p.drawRectangle({x:x-s*.28,y:y+s*.06,width:s*.45,height:s*.05,color:IC}); p.drawRectangle({x:x-s*.17,y:y-s*.11,width:s*.45,height:s*.05,color:IC}); p.drawRectangle({x:x+s*.14,y:y+s*.03,width:s*.08,height:s*.12,color:IC}); p.drawRectangle({x:x-s*.22,y:y-s*.14,width:s*.08,height:s*.12,color:IC}); },

  // ── POLITICS ──
  swissCross: (p,x,y,s) => { p.drawRectangle({x:x-s*.08,y:y-s*.24,width:s*.16,height:s*.48,color:IC}); p.drawRectangle({x:x-s*.24,y:y-s*.08,width:s*.48,height:s*.16,color:IC}); },
  bundeshaus: (p,x,y,s) => { p.drawRectangle({x:x-s*.32,y:y-s*.22,width:s*.64,height:s*.28,color:IC}); p.drawCircle({x,y:y+s*.12,size:s*.18,color:IC}); },
  mountain: (p,x,y,s) => { p.drawRectangle({x:x-s*.32,y:y-s*.22,width:s*.28,height:s*.38,color:IC}); p.drawRectangle({x:x-s*.04,y:y-s*.22,width:s*.36,height:s*.5,color:IC}); },
  ballotBox: (p,x,y,s) => { p.drawRectangle({x:x-s*.22,y:y-s*.22,width:s*.44,height:s*.38,color:IC}); p.drawRectangle({x:x-s*.07,y:y+s*.14,width:s*.14,height:s*.05,color:W}); p.drawRectangle({x:x-s*.12,y:y+s*.2,width:s*.24,height:s*.14,color:IC}); },
  gavel: (p,x,y,s) => { p.drawRectangle({x:x-s*.05,y:y-s*.32,width:s*.1,height:s*.45,color:IC}); p.drawRectangle({x:x-s*.18,y:y+s*.12,width:s*.36,height:s*.12,color:IC}); p.drawRectangle({x:x-s*.22,y:y-s*.32,width:s*.44,height:s*.08,color:IC}); },
  euStars: (p,x,y,s) => { for(let i=0;i<12;i++){const a=(i/12)*Math.PI*2-Math.PI/2; p.drawRectangle({x:x+Math.cos(a)*s*.24-s*.03,y:y+Math.sin(a)*s*.24-s*.03,width:s*.06,height:s*.06,color:IC});} },
  parliament: (p,x,y,s) => { p.drawRectangle({x:x-s*.32,y:y-s*.22,width:s*.64,height:s*.32,color:IC}); p.drawCircle({x,y:y+s*.16,size:s*.22,color:IC}); p.drawRectangle({x:x-s*.32,y:y-s*.22,width:s*.64,height:s*.12,color:W}); },
  dove: (p,x,y,s) => { p.drawCircle({x,y,size:s*.14,color:IC}); p.drawRectangle({x:x+s*.1,y:y,width:s*.22,height:s*.08,color:IC}); p.drawRectangle({x:x-s*.06,y:y+s*.12,width:s*.18,height:s*.06,color:IC}); },
  document: (p,x,y,s) => { p.drawRectangle({x:x-s*.17,y:y-s*.28,width:s*.34,height:s*.56,color:IC}); for(let i=0;i<4;i++) p.drawRectangle({x:x-s*.1,y:y+s*.14-i*s*.1,width:s*.2,height:s*.04,color:W}); },

  // ── TECH ──
  smartphone: (p,x,y,s) => { p.drawRectangle({x:x-s*.14,y:y-s*.28,width:s*.28,height:s*.56,color:IC}); p.drawRectangle({x:x-s*.1,y:y-s*.2,width:s*.2,height:s*.36,color:W}); p.drawCircle({x,y:y-s*.24,size:s*.03,color:W}); },
  satellite: (p,x,y,s) => { p.drawRectangle({x:x-s*.08,y:y-s*.08,width:s*.16,height:s*.16,color:IC}); p.drawRectangle({x:x-s*.28,y:y-s*.04,width:s*.18,height:s*.08,color:IC}); p.drawRectangle({x:x+s*.1,y:y-s*.04,width:s*.18,height:s*.08,color:IC}); },
  wifi: (p,x,y,s) => { p.drawCircle({x,y:y-s*.16,size:s*.05,color:IC}); p.drawCircle({x,y:y-s*.1,size:s*.18,color:IC}); p.drawCircle({x,y:y-s*.1,size:s*.12,color:W}); p.drawCircle({x,y:y-s*.04,size:s*.28,color:IC}); p.drawCircle({x,y:y-s*.04,size:s*.22,color:W}); },
  battery: (p,x,y,s) => { p.drawRectangle({x:x-s*.22,y:y-s*.12,width:s*.44,height:s*.24,color:IC}); p.drawRectangle({x:x+s*.22,y:y-s*.06,width:s*.08,height:s*.12,color:IC}); p.drawRectangle({x:x-s*.18,y:y-s*.08,width:s*.22,height:s*.16,color:W}); },
  cloud: (p,x,y,s) => { p.drawCircle({x:x-s*.1,y,size:s*.16,color:IC}); p.drawCircle({x:x+s*.12,y,size:s*.14,color:IC}); p.drawCircle({x,y:y+s*.1,size:s*.12,color:IC}); p.drawRectangle({x:x-s*.24,y:y-s*.12,width:s*.48,height:s*.14,color:IC}); },
  code: (p,x,y,s) => { p.drawRectangle({x:x-s*.22,y:y-s*.03,width:s*.14,height:s*.06,color:IC}); p.drawRectangle({x:x-s*.22,y:y+s*.12,width:s*.08,height:s*.05,color:IC}); p.drawRectangle({x:x-s*.22,y:y-s*.17,width:s*.08,height:s*.05,color:IC}); p.drawRectangle({x:x+s*.08,y:y-s*.03,width:s*.14,height:s*.06,color:IC}); p.drawRectangle({x:x+s*.14,y:y+s*.12,width:s*.08,height:s*.05,color:IC}); p.drawRectangle({x:x+s*.14,y:y-s*.17,width:s*.08,height:s*.05,color:IC}); },

  // ── AI / ROBOTIK ──
  brain: (p,x,y,s) => { p.drawCircle({x:x-s*.1,y:y+s*.06,size:s*.2,color:IC}); p.drawCircle({x:x+s*.1,y:y+s*.06,size:s*.2,color:IC}); p.drawRectangle({x:x-s*.02,y:y-s*.16,width:s*.04,height:s*.32,color:W}); },
  chip: (p,x,y,s) => { p.drawRectangle({x:x-s*.18,y:y-s*.18,width:s*.36,height:s*.36,color:IC}); for(let i=0;i<5;i++){p.drawRectangle({x:x-s*.14+i*s*.07,y:y+s*.18,width:s*.04,height:s*.1,color:IC}); p.drawRectangle({x:x-s*.14+i*s*.07,y:y-s*.28,width:s*.04,height:s*.1,color:IC});} },
  robot: (p,x,y,s) => { p.drawRectangle({x:x-s*.2,y:y-s*.18,width:s*.4,height:s*.34,color:IC}); p.drawRectangle({x:x-s*.12,y:y+s*.06,width:s*.08,height:s*.08,color:W}); p.drawRectangle({x:x+s*.04,y:y+s*.06,width:s*.08,height:s*.08,color:W}); p.drawRectangle({x:x-s*.04,y:y+s*.16,width:s*.08,height:s*.14,color:IC}); },
  drone: (p,x,y,s) => { p.drawRectangle({x:x-s*.08,y:y-s*.08,width:s*.16,height:s*.16,color:IC}); p.drawRectangle({x:x-s*.28,y:y+s*.05,width:s*.56,height:s*.03,color:IC}); p.drawCircle({x:x-s*.25,y:y+s*.06,size:s*.08,color:IC}); p.drawCircle({x:x+s*.25,y:y+s*.06,size:s*.08,color:IC}); },
  mechHand: (p,x,y,s) => { p.drawRectangle({x:x-s*.14,y:y-s*.22,width:s*.28,height:s*.18,color:IC}); for(let i=0;i<4;i++) p.drawRectangle({x:x-s*.12+i*s*.075,y:y-s*.04,width:s*.05,height:s*.24,color:IC}); },
  circuit: (p,x,y,s) => { p.drawRectangle({x:x-s*.28,y:y-s*.02,width:s*.56,height:s*.04,color:IC}); p.drawRectangle({x:x-s*.02,y:y-s*.28,width:s*.04,height:s*.56,color:IC}); p.drawCircle({x,y,size:s*.08,color:IC}); p.drawCircle({x:x-s*.22,y,size:s*.05,color:IC}); p.drawCircle({x:x+s*.22,y,size:s*.05,color:IC}); p.drawCircle({x,y:y+s*.22,size:s*.05,color:IC}); p.drawCircle({x,y:y-s*.22,size:s*.05,color:IC}); },
  eye: (p,x,y,s) => { p.drawCircle({x,y,size:s*.22,color:IC}); p.drawCircle({x,y,size:s*.14,color:W}); p.drawCircle({x,y,size:s*.1,color:IC}); p.drawCircle({x,y,size:s*.04,color:W}); },
  lightning: (p,x,y,s) => { p.drawRectangle({x:x-s*.1,y:y+s*.06,width:s*.22,height:s*.08,color:IC}); p.drawRectangle({x:x-s*.14,y:y-s*.06,width:s*.22,height:s*.08,color:IC}); p.drawRectangle({x:x-s*.05,y:y-s*.28,width:s*.1,height:s*.22,color:IC}); p.drawRectangle({x:x-s*.05,y:y+s*.14,width:s*.1,height:s*.22,color:IC}); },

  // ── SPORT ──
  football: (p,x,y,s) => { p.drawCircle({x,y,size:s*.25,color:IC}); p.drawRectangle({x:x-s*.1,y:y-s*.1,width:s*.2,height:s*.2,color:W}); p.drawRectangle({x:x-s*.06,y:y-s*.06,width:s*.12,height:s*.12,color:IC}); },
  shoe: (p,x,y,s) => { p.drawRectangle({x:x-s*.28,y:y-s*.1,width:s*.56,height:s*.12,color:IC}); p.drawRectangle({x:x-s*.28,y:y+s*.02,width:s*.22,height:s*.18,color:IC}); },
  stopwatch: (p,x,y,s) => { p.drawCircle({x,y:y-s*.06,size:s*.22,color:IC}); p.drawRectangle({x:x-s*.04,y:y+s*.16,width:s*.08,height:s*.12,color:IC}); p.drawRectangle({x:x-s*.1,y:y+s*.25,width:s*.2,height:s*.05,color:IC}); },
  medal: (p,x,y,s) => { p.drawCircle({x,y:y-s*.06,size:s*.18,color:IC}); p.drawRectangle({x:x-s*.12,y:y+s*.12,width:s*.1,height:s*.22,color:IC}); p.drawRectangle({x:x+s*.02,y:y+s*.12,width:s*.1,height:s*.22,color:IC}); },
  dumbbell: (p,x,y,s) => { p.drawRectangle({x:x-s*.22,y:y-s*.04,width:s*.44,height:s*.08,color:IC}); p.drawRectangle({x:x-s*.28,y:y-s*.12,width:s*.1,height:s*.24,color:IC}); p.drawRectangle({x:x+s*.18,y:y-s*.12,width:s*.1,height:s*.24,color:IC}); },
  whistle: (p,x,y,s) => { p.drawCircle({x:x-s*.1,y,size:s*.14,color:IC}); p.drawRectangle({x:x+s*.02,y:y-s*.04,width:s*.22,height:s*.08,color:IC}); p.drawRectangle({x:x+s*.18,y:y+s*.02,width:s*.05,height:s*.12,color:IC}); },

  // ── INVESTIGATIVE ──
  magnifier: (p,x,y,s) => { p.drawCircle({x:x-s*.06,y:y+s*.06,size:s*.2,color:IC}); p.drawCircle({x:x-s*.06,y:y+s*.06,size:s*.13,color:W}); p.drawRectangle({x:x+s*.1,y:y-s*.22,width:s*.08,height:s*.24,color:IC}); },
  spotlight: (p,x,y,s) => { p.drawRectangle({x:x-s*.18,y:y+s*.18,width:s*.36,height:s*.12,color:IC}); p.drawRectangle({x:x-s*.28,y:y-s*.22,width:s*.56,height:s*.35,color:IC}); p.drawRectangle({x:x-s*.22,y:y-s*.18,width:s*.44,height:s*.28,color:W}); },
  exclamation: (p,x,y,s) => { p.drawRectangle({x:x-s*.04,y:y-s*.05,width:s*.08,height:s*.3,color:IC}); p.drawRectangle({x:x-s*.04,y:y-s*.18,width:s*.08,height:s*.08,color:IC}); },
};

// ═══════════════════════════════════════════════════════════
// THEME → 20 icons each (with shared icons)
// ═══════════════════════════════════════════════════════════
const THEMES_ICONS = {
  'handwerk': [I.hammer, I.wrench, I.screwdriver, I.gear, I.ruler, I.paintRoller, I.saw, I.bolt, I.pliers, I.hardhat, I.lightbulb, I.target, I.hammer, I.gear, I.wrench, I.ruler, I.bolt, I.saw, I.pliers, I.screwdriver],
  'selbstaendigkeit': [I.lightbulb, I.briefcase, I.rocket, I.target, I.chartUp, I.key, I.handshake, I.plant, I.trophy, I.diamond, I.star, I.flag, I.lightbulb, I.rocket, I.chartUp, I.briefcase, I.target, I.key, I.plant, I.diamond],
  'fuehrungskompetenzen': [I.crown, I.chessKing, I.podium, I.compass, I.star, I.flag, I.handshake, I.trophy, I.target, I.lightbulb, I.key, I.diamond, I.crown, I.chessKing, I.podium, I.compass, I.star, I.flag, I.handshake, I.trophy],
  'abrechnung-operativ': [I.calculator, I.receipt, I.pieChart, I.folder, I.clipboard, I.coins, I.chf, I.euro, I.dollar, I.yen, I.pound, I.barChart, I.percent, I.document, I.calculator, I.chf, I.euro, I.coins, I.receipt, I.clipboard],
  'aktien-maerkte': [I.candlestick, I.bull, I.barChart, I.building, I.lineChart, I.dollar, I.chf, I.euro, I.yen, I.chartUp, I.coins, I.percent, I.target, I.candlestick, I.bull, I.barChart, I.lineChart, I.building, I.dollar, I.chartUp],
  'krypto': [I.bitcoin, I.chainLink, I.block, I.nodeNetwork, I.shield, I.ethereum, I.lock, I.wallet, I.lightning, I.chip, I.bitcoin, I.chainLink, I.shield, I.nodeNetwork, I.block, I.ethereum, I.wallet, I.lock, I.lightning, I.chip],
  'makrooekonomie': [I.globe, I.bank, I.scale, I.percent, I.arrowExchange, I.barChart, I.chf, I.euro, I.dollar, I.yen, I.pound, I.lineChart, I.coins, I.building, I.globe, I.bank, I.scale, I.percent, I.arrowExchange, I.coins],
  'schweizer-politik': [I.swissCross, I.bundeshaus, I.mountain, I.ballotBox, I.flag, I.gavel, I.document, I.handshake, I.scale, I.crown, I.swissCross, I.bundeshaus, I.mountain, I.ballotBox, I.flag, I.gavel, I.document, I.handshake, I.scale, I.crown],
  'europaeische-politik': [I.euStars, I.parliament, I.globe, I.handshake, I.document, I.flag, I.scale, I.gavel, I.dove, I.building, I.euStars, I.parliament, I.globe, I.handshake, I.document, I.flag, I.dove, I.scale, I.gavel, I.building],
  'weltpolitik': [I.globe, I.dove, I.building, I.scale, I.flag, I.shield, I.document, I.gavel, I.handshake, I.crown, I.globe, I.dove, I.building, I.scale, I.flag, I.shield, I.document, I.gavel, I.handshake, I.crown],
  'ki': [I.brain, I.chip, I.nodeNetwork, I.eye, I.lightning, I.robot, I.circuit, I.cloud, I.code, I.lightbulb, I.brain, I.chip, I.nodeNetwork, I.eye, I.lightning, I.robot, I.circuit, I.cloud, I.code, I.lightbulb],
  'ki-automatisierung': [I.gear, I.mechHand, I.circuit, I.chip, I.robot, I.lightning, I.nodeNetwork, I.code, I.cloud, I.brain, I.gear, I.mechHand, I.circuit, I.chip, I.robot, I.lightning, I.nodeNetwork, I.code, I.cloud, I.brain],
  'robotik': [I.robot, I.mechHand, I.drone, I.circuit, I.chip, I.gear, I.brain, I.eye, I.lightning, I.nodeNetwork, I.robot, I.mechHand, I.drone, I.circuit, I.chip, I.gear, I.brain, I.eye, I.lightning, I.nodeNetwork],
  'technik': [I.smartphone, I.satellite, I.wifi, I.battery, I.cloud, I.code, I.chip, I.lightning, I.gear, I.rocket, I.smartphone, I.satellite, I.wifi, I.battery, I.cloud, I.code, I.chip, I.lightning, I.gear, I.rocket],
  'sport': [I.football, I.trophy, I.shoe, I.stopwatch, I.medal, I.dumbbell, I.whistle, I.star, I.target, I.flag, I.football, I.trophy, I.shoe, I.stopwatch, I.medal, I.dumbbell, I.whistle, I.star, I.target, I.flag],
  'enthuellung': [I.magnifier, I.spotlight, I.lock, I.document, I.eye, I.exclamation, I.shield, I.key, I.lightning, I.flag, I.magnifier, I.spotlight, I.lock, I.document, I.eye, I.exclamation, I.shield, I.key, I.lightning, I.flag],
};

// ═══════════════════════════════════════════════════════════
// 20 icon positions — large, overlapping, full page coverage
// ═══════════════════════════════════════════════════════════
function getPositions() {
  // Only in the middle zone: y between 80 (above footer) and 760 (below header)
  return [
    {x:80,  y:700, s:180}, {x:320, y:690, s:170}, {x:510, y:710, s:160},
    {x:150, y:580, s:190}, {x:400, y:600, s:175}, {x:540, y:560, s:155},
    {x:60,  y:470, s:170}, {x:270, y:490, s:185}, {x:460, y:460, s:165},
    {x:170, y:370, s:180}, {x:380, y:350, s:170}, {x:530, y:380, s:160},
    {x:80,  y:260, s:175}, {x:290, y:240, s:190}, {x:480, y:270, s:165},
    {x:150, y:150, s:170}, {x:360, y:140, s:180}, {x:520, y:160, s:155},
    {x:60,  y:100, s:160}, {x:250, y:90,  s:170},
  ];
}

// ═══════════════════════════════════════════════════════════
// GENERATE
// ═══════════════════════════════════════════════════════════
async function generateTemplate(slug, name) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontLight = await doc.embedFont(StandardFonts.Helvetica);
  const fullOrange = rgb(0.91, 0.365, 0.149);
  const icons = THEMES_ICONS[slug];
  if (!icons) { console.log(`  Skip ${slug}`); return; }

  const positions = getPositions();

  // 58 identical pages (14k Wörter + Bilder alle 500 Wörter + 2 Puffer)
  for (let pg = 0; pg < 58; pg++) {
    const page = doc.addPage([PW, PH]);
    page.drawRectangle({x:0,y:0,width:PW,height:PH,color:W});

    // Header — "Macher" schwarz + "Post" orange
    const black = rgb(0.1, 0.1, 0.1);
    page.drawText('Macher', {x:50, y:PH-50, size:22, font, color:black});
    const macherWidth = font.widthOfTextAtSize('Macher', 22);
    page.drawText('Post', {x:50+macherWidth, y:PH-50, size:22, font, color:fullOrange});

    // Thema-Name rechts oben
    const nameWidth = font.widthOfTextAtSize(name, 14);
    page.drawText(name, {x:PW-50-nameWidth, y:PH-50, size:14, font, color:black});

    page.drawRectangle({x:50, y:PH-58, width:PW-100, height:2, color:fullOrange});

    // Footer — grössere Schrift, schwarzer Text
    const footerColor = rgb(0.25, 0.25, 0.25);
    page.drawRectangle({x:50, y:48, width:PW-100, height:1, color:rgb(0.75,0.75,0.75)});
    page.drawText('www.macherpost.com', {x:50, y:30, size:11, font:fontLight, color:footerColor});
    page.drawText('Mit Unterstützung von KI erstellt', {x:PW/2-75, y:30, size:10, font:fontLight, color:footerColor});
    page.drawText(`${pg+1}`, {x:PW-60, y:30, size:11, font:fontLight, color:footerColor});
  }

  const outDir = path.join(__dirname, '..', 'templates', 'pdf');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, {recursive:true});
  const outPath = path.join(outDir, `${slug}.pdf`);
  fs.writeFileSync(outPath, await doc.save());
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log('\n🔧 Generiere 16 PDF-Vorlagen (20 Icons, 30% Deckkraft)...\n');
  const themes = [
    {s:'handwerk',n:'Handwerk'},{s:'selbstaendigkeit',n:'Selbständigkeit'},{s:'fuehrungskompetenzen',n:'Führungskompetenzen'},
    {s:'abrechnung-operativ',n:'Abrechnung & Operativ'},{s:'aktien-maerkte',n:'Aktien & Märkte'},{s:'krypto',n:'Krypto'},
    {s:'makrooekonomie',n:'Makroökonomie'},{s:'schweizer-politik',n:'Schweizer Politik'},{s:'europaeische-politik',n:'Europäische Politik'},
    {s:'weltpolitik',n:'Weltpolitik'},{s:'ki',n:'KI'},{s:'ki-automatisierung',n:'KI-Automatisierung'},
    {s:'robotik',n:'Robotik'},{s:'technik',n:'Technik'},{s:'sport',n:'Sport'},{s:'enthuellung',n:'Enthüllungen'},
  ];
  for (const t of themes) await generateTemplate(t.s, t.n);
  console.log(`\n✅ Fertig — ${themes.length} Vorlagen in templates/pdf/\n`);
}

main().catch(console.error);
