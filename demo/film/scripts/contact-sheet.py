from PIL import Image, ImageDraw, ImageFont, ImageChops, ImageStat
from pathlib import Path
import json
root = Path('review')
frames = [90,330,420,540,680,770,1010,1380,1450,1600,1900,2260,2530,2820,3060,3450,3710,3900]
boundaries = [210,450,810,1260,1650,2040,2640,3300,3570,3780]
font = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 16)
def sheet(numbers, cols, output):
    width, height, label = 480,270,28
    canvas = Image.new('RGB',(cols*width,((len(numbers)+cols-1)//cols)*(height+label)), '#0b1418')
    draw = ImageDraw.Draw(canvas)
    for i,f in enumerate(numbers):
        x,y=(i%cols)*width,(i//cols)*(height+label)
        with Image.open(root/f'f{f:05}.png') as im:
            canvas.paste(im.convert('RGB').resize((width,height),Image.Resampling.LANCZOS),(x,y))
        draw.text((x+12,y+height+4),f'f{f:05}  |  {f/30:06.2f}s',font=font,fill='#e8a33d')
    canvas.save(root/output,quality=93)
sheet(frames,3,'sheet.jpg')
for start in [0,5]:
    sheet([b+d for b in boundaries[start:start+5] for d in [-1,0,9,18]],4,f'boundaries-{start//5+1}.jpg')
# Scene boundary discontinuity check: exclude only the changing narration-slot guide.
report=[]
for b in boundaries:
    before=Image.open(root/f'f{b-1:05}.png').convert('RGB').crop((0,0,1920,1000))
    after=Image.open(root/f'f{b:05}.png').convert('RGB').crop((0,0,1920,1000))
    delta=sum(ImageStat.Stat(ImageChops.difference(before,after)).mean)/3/255
    report.append({'boundary':b,'mean_pixel_change':round(delta,6),'passed':delta<0.02})
(root/'boundary-check.json').write_text(json.dumps({'checks':report,'threshold':0.02,'exclusion':'bottom 80px narration-slot guide','unenforced':['Perceptual full-speed motion and audio require playback review.']},indent=2))
assert all(r['passed'] for r in report), report
print(json.dumps(report,indent=2))
