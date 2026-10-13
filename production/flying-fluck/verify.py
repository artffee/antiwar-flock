"""Verify generated PDF geometry, typography, margins and prepress guard.

Requires PyMuPDF for inspection, in addition to requirements.txt.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

import fitz
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--proofs',type=Path,required=True)
parser.add_argument('--artwork-dir',type=Path,required=True)
args=parser.parse_args()
settings=json.loads((ROOT/'settings.json').read_text())
data=json.loads((ROOT/'content.json').read_text())
assert settings['printer']['spine_mm'] is None
assert not settings['layout']['defaults_are_printer_confirmed']
assert not settings['commerce']['purchasing_enabled']
assert sum(len(s['entries']) for s in data['sections'])==168
checks=0
for filename,pages in [
 ('A305X_Flying_Fluck_Interior_190p_PROOF.pdf',190),
 ('A305X_Flying_Fluck_Digital_192p_PROOF.pdf',192),
 ('A305X_Flying_Fluck_Preview_10p.pdf',10),
 ('A305X_Flying_Fluck_Cover_Layout_PROOF.pdf',2),
 ('A305X_Flying_Fluck_Print_Worksheet.pdf',3)]:
 path=args.proofs/filename;r=PdfReader(path)
 assert len(r.pages)==pages,(filename,len(r.pages));checks+=1
 if 'Interior' in filename or 'Digital' in filename or 'Preview' in filename:
  for p in r.pages:
   assert tuple(map(float,p.mediabox))==(0,0,432,648);checks+=1
 if 'Cover_Layout' in filename:
  for p in r.pages:
   trim=list(map(float,p.trimbox));bleed=list(map(float,p.bleedbox))
   assert trim[2]-trim[0]==432 and trim[3]-trim[1]==648
   assert bleed[2]-bleed[0]==450 and bleed[3]-bleed[1]==666
   assert all(abs(abs(t-b)-9)<.001 for t,b in zip(trim,bleed))
   assert 'NOT FOR PRESS' in p.extract_text();checks+=4

path=args.proofs/'A305X_Flying_Fluck_Interior_190p_PROOF.pdf'
reader=PdfReader(path);document=fitz.open(path)
for i,page in enumerate(document):
 left=18*72/25.4 if (i+1)%2 else 36
 right=396 if (i+1)%2 else 432-18*72/25.4
 text=page.get_text()
 assert 'FIELD MANUAL' not in text
 assert 'A305X / FLYING FLUCK' in text
 for block in page.get_text('dict')['blocks']:
  for line in block.get('lines',[]):
   x0,y0,x1,y1=line['bbox']
   assert x0>=left-.75 and x1<=right+.75,(i+1,line)
   assert y0>=36 and y1<=612.1,(i+1,line)
   checks+=1
 for font in reader.pages[i]['/Resources']['/Font'].values():
  obj=font.get_object()
  if obj.get('/Subtype')=='/TrueType':
   descriptor=obj['/FontDescriptor'].get_object()
   assert descriptor.get('/FontFile2') or descriptor.get('/FontFile3');checks+=1

for t,section in enumerate(data['sections']):
 for day,entry in enumerate(section['entries']):
  # New interior indices: instruction + (divider/tracker/dashboard/mood,
  # 42 entries, release) for each section. Covers are not in this file.
  page=document[5+t*47+day]
  text=page.get_text()
  for prompt in entry['prompts']:
   assert prompt in text,(t,day,prompt);checks+=1

guard=subprocess.run([sys.executable,str(ROOT/'build.py'),'--artwork-dir',str(args.artwork_dir),'--output',str(args.proofs/'blocked-final'),'--final'],capture_output=True,text=True)
assert guard.returncode!=0
assert 'Final press export is blocked' in guard.stderr
assert not (args.proofs/'blocked-final').exists()
checks+=3
report={'checks':checks,'interior_pages':190,'digital_pages':192,'preview_pages':10,'guided_pages':168,'retained_prompts':504,'embedded_fonts':True,'text_within_mirrored_margins':True,'draft_cover_trim_and_bleed_boxes':True,'unconfirmed_press_export_rejected':True,'browser_qa':'unavailable'}
(args.proofs/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
