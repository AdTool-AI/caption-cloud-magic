import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
const [,, base, out] = process.argv;
const urls = JSON.parse(process.env.CLIP_URLS || "null") || [0,1,2,3,4,5].map(i=>`${base}/c${i}.mp4`);
const scenes = urls.map((u,i)=>({ id:`s${i}`, startTime:i*5, endTime:i*5+5, originalStartTime:i*5, originalEndTime:i*5+5,
  mediaSourceStart:0, mediaSourceEnd:5, playbackRate:1, additionalMedia:{type:'video',url:u,duration:5}, sourceMode:'media', isFromOriginalVideo:false }));
const inputProps = { sourceVideoUrl: urls[0], scenes, durationInSeconds:30, targetWidth:270, targetHeight:480,
  brightness:100, contrast:100, saturation:100, sharpness:0, temperature:0, vignette:0 };
const serveUrl = await bundle({ entryPoint: path.resolve("/dev-server/src/remotion/index.ts"),
  webpackOverride: (c)=>({...c, resolve:{...c.resolve, alias:{...(c.resolve?.alias||{}), "@": "/dev-server/src"}}}) });
const composition = await selectComposition({ serveUrl, id:"DirectorsCutVideo", inputProps, browserExecutable:"/bin/chromium", chromiumOptions:{gl:"swiftshader"} });
await renderMedia({ composition, serveUrl, codec:"h264", outputLocation: out, inputProps, browserExecutable:"/bin/chromium", concurrency:4, muted:true });
console.log("rendered", out);
