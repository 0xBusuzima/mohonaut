#!/bin/bash
# Builds the reveal teaser (docs/05 2.9: 15-20 s, 16:9 and 9:16) from the game's own scene.
# Needs ffmpeg. In a scratch folder outside the repo (the videos are large; brand/video/ is
# gitignored), with the built site served (cd apps/web && PORT=4178 node e2e/serve.mjs):
#
#   node apps/web/scripts/capture-scene.mjs "http://127.0.0.1:4178/design/site/?decor=1&pads=12&hd=1" <dir>/wide 1920 1080 9
#   DPR=2 node apps/web/scripts/capture-scene.mjs "...same url..." <dir>/tall 540 960 9
#   cp node_modules/@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_900Black.ttf <dir>/bsd.ttf
#   cp node_modules/@expo-google-fonts/barlow/600SemiBold/Barlow_600SemiBold.ttf <dir>/barlow.ttf
#   cd <dir> && bash <repo>/tools/brand/teaser.sh
set -e
BG=0x0b0f17
mk() { # $1 frames dir, $2 W, $3 H, $4 out prefix
  local D=$1 W=$2 H=$3 O=$4
  # 1) wide shot: 5 s, slow push-in (scene animates at its own 10 fps; the zoom is smooth at 30)
  ffmpeg -y -loglevel error -framerate 10 -i $D/f%04d.png -vf "fps=30,trim=duration=5,zoompan=z='1+0.0006*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=30,fade=t=in:st=0:d=0.8,format=yuv420p" -c:v libx264 -crf 16 -preset slow ${O}_1.mp4
  # 2) closer: 4 s from 4.5 s on, 1.7x, drifting right
  ffmpeg -y -loglevel error -framerate 10 -start_number 45 -i $D/f%04d.png -vf "fps=30,trim=duration=4,zoompan=z=1.7:x='iw/2-(iw/zoom/2)-60+on*0.5':y='ih/2-(ih/zoom/2)+40':d=1:s=${W}x${H}:fps=30,format=yuv420p" -c:v libx264 -crf 16 -preset slow ${O}_2.mp4
  # 3) slogan card, 3.5 s
  local S=$(( W < H ? 120 : 150 ))
  ffmpeg -y -loglevel error -f lavfi -i color=c=$BG:s=${W}x${H}:d=3.5:r=30 -vf "drawtext=fontfile=bsd.ttf:text='NOT THE MOON.':fontcolor=0xece7dc:fontsize=$S:x=(w-text_w)/2:y=h/2-text_h-10:alpha='min(1,t/0.4)',drawtext=fontfile=bsd.ttf:text='THE MOHO.':fontcolor=0xff6b1a:fontsize=$S:x=(w-text_w)/2:y=h/2+10:alpha='if(lt(t,1.0),0,min(1,(t-1.0)/0.4))',format=yuv420p" -c:v libx264 -crf 16 -preset slow ${O}_3.mp4
  # 4) name card, 3.5 s: hazard stripe, name, address
  local N=$(( W < H ? 150 : 170 )) A=$(( W < H ? 46 : 52 ))
  ffmpeg -y -loglevel error -f lavfi -i color=c=$BG:s=${W}x${H}:d=3.5:r=30 -vf "drawbox=x=0:y=0:w=iw:h=14:color=0xffb31a:t=fill,drawbox=x=0:y=ih-14:w=iw:h=14:color=0xffb31a:t=fill,drawtext=fontfile=bsd.ttf:text='MOHONAUT':fontcolor=0xff6b1a:fontsize=$N:x=(w-text_w)/2:y=h/2-text_h:alpha='min(1,t/0.4)',drawtext=fontfile=barlow.ttf:text='mohonaut.com':fontcolor=0xece7dc:fontsize=$A:x=(w-text_w)/2:y=h/2+40:alpha='if(lt(t,0.6),0,min(1,(t-0.6)/0.4))',fade=t=out:st=2.9:d=0.6,format=yuv420p" -c:v libx264 -crf 16 -preset slow ${O}_4.mp4
  # join with short crossfades
  ffmpeg -y -loglevel error -i ${O}_1.mp4 -i ${O}_2.mp4 -i ${O}_3.mp4 -i ${O}_4.mp4 -filter_complex "[0][1]xfade=transition=fade:duration=0.6:offset=4.4[a];[a][2]xfade=transition=fade:duration=0.6:offset=7.8[b];[b][3]xfade=transition=fade:duration=0.6:offset=10.7,format=yuv420p[v]" -map "[v]" -c:v libx264 -crf 17 -preset slow -movflags +faststart ${O}.mp4
  rm ${O}_1.mp4 ${O}_2.mp4 ${O}_3.mp4 ${O}_4.mp4
}
mk wide 1920 1080 teaser-16x9
mk tall 1080 1920 teaser-9x16
