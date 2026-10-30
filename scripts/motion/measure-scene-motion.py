import subprocess, sys, numpy as np
f=sys.argv[1]; bad=0
def grab(t):
    raw=subprocess.run(["ffmpeg","-loglevel","error","-ss",str(t),"-i",f,"-frames:v","1","-vf","scale=135:240,format=gray","-f","rawvideo","-"],capture_output=True).stdout
    return np.frombuffer(raw,np.uint8).astype(float)
for s in range(6):
    fr=[grab(s*5+o) for o in (0.6,2.0,3.4,4.6)]
    d=np.mean([np.abs(fr[i+1]-fr[i]).mean() for i in range(3)])
    ok=d>1.0; bad+= not ok
    print(f"scene {s+1}: mean frame diff {d:.2f} -> {'MOVING' if ok else 'STATIC'}")
sys.exit(1 if bad else 0)
