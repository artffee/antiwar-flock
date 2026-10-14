"""Prepare a KDP paperback candidate from the exact recovered artwork.

The selected profile is a working default, not a user-confirmed order.
Vector outlines retain the native artwork's geometry without claiming new
raster detail. The paper texture is replaced by a uniform ivory print field.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET

import fitz
import numpy as np
import vtracer
from PIL import Image
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject, ContentStream, FloatObject
from reportlab.lib.colors import CMYKColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT=Path(__file__).resolve().parent
SVG='http://www.w3.org/2000/svg'
NUMBER=r'[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?'
PAPER=CMYKColor(0,.016,.055,.0118)
BLACK=CMYKColor(0,0,0,1)
PINK=CMYKColor(0,1,.4,0)


def masks(path):
    rgb=np.asarray(Image.open(path).convert('RGB')).astype(np.int16)
    r,g,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
    pink=(r-g>80)&(b-g>35)&(r>140)
    black=(r<160)&(g<160)&(b<160)&~pink
    return {'black':black,'pink':pink}


def trace(path,temp):
    result={};quality={}
    for name,mask in masks(path).items():
        raster=temp/f'{path.stem}-{name}.png'
        # Trace on a doubled nearest-neighbor grid so the tracer keeps the
        # original one-pixel bird details. This does not create native detail.
        scale=2
        Image.fromarray(np.where(mask,0,255).astype('uint8')).resize(
            (mask.shape[1]*scale,mask.shape[0]*scale),Image.Resampling.NEAREST
        ).save(raster)
        vector=temp/f'{path.stem}-{name}.svg'
        vtracer.convert_image_to_svg_py(str(raster),str(vector),colormode='binary',mode='spline',filter_speckle=0,corner_threshold=60,length_threshold=3.5,max_iterations=10,splice_threshold=45,path_precision=6)
        tree=ET.parse(vector).getroot()
        tree.set('width',str(mask.shape[1]));tree.set('height',str(mask.shape[0]))
        tree.set('viewBox',f'0 0 {mask.shape[1]} {mask.shape[0]}')
        for element in tree.iter(f'{{{SVG}}}path'):
            for attribute in ['d','transform']:
                if attribute in element.attrib:
                    element.set(attribute,re.sub(NUMBER,lambda n:format(float(n.group())/scale,'.8g'),element.attrib[attribute]))
        ET.ElementTree(tree).write(vector,encoding='utf-8',xml_declaration=True)
        result[name]=[(p.attrib['d'],p.attrib.get('transform','')) for p in tree.iter(f'{{{SVG}}}path')]
        doc=fitz.open(stream=vector.read_bytes(),filetype='svg')
        page=doc[0];pix=page.get_pixmap(matrix=fitz.Matrix(mask.shape[1]/page.rect.width,mask.shape[0]/page.rect.height),colorspace=fitz.csRGB,alpha=False)
        image=np.frombuffer(pix.samples,dtype=np.uint8).reshape(pix.height,pix.width,3)
        traced=image.mean(axis=2)<128
        assert traced.shape==mask.shape
        def iou(a,b):return float((a&b).sum()/max((a|b).sum(),1))
        score=iou(mask,traced)
        if score<.995:raise ValueError(f'Artwork trace diverged: {path.name}/{name} {score:.4f}')
        regions={}
        if name=='black':
            for label,section in [('tiny_flamingo',np.s_[1240:1448,430:600]),('footer_lettering',np.s_[1450:1536,:]),('brand_mark',np.s_[:125,:])]:
                value=iou(mask[section],traced[section]);regions[label]=value
                if value<.98:raise ValueError(f'Trace changed {label}: {value:.4f}')
        quality[name]={'native_mask_iou':score,'regions':regions,'path_count':len(result[name])}
    return result,quality


def draw_path(c,data):
    tokens=re.findall(r'[A-Za-z]|'+NUMBER,data)
    p=c.beginPath();i=0;command=None;x=y=0;sx=sy=0
    while i<len(tokens):
        if tokens[i].isalpha():command=tokens[i];i+=1
        relative=command.islower();cmd=command.upper()
        if cmd=='Z':p.close();x,y=sx,sy;command=None;continue
        if cmd not in ['M','L','C','H','V']:raise ValueError(f'Unsupported SVG command {cmd}')
        n={'M':2,'L':2,'C':6,'H':1,'V':1}[cmd]
        values=list(map(float,tokens[i:i+n]));i+=n
        if cmd in ['M','L']:
            nx,ny=values
            if relative:nx+=x;ny+=y
            if cmd=='M':p.moveTo(nx,ny);sx,sy=nx,ny;command='l' if relative else 'L'
            else:p.lineTo(nx,ny)
            x,y=nx,ny
        elif cmd=='C':
            if relative:values=[v+(x if k%2==0 else y) for k,v in enumerate(values)]
            p.curveTo(*values);x,y=values[-2:]
        elif cmd=='H':x=values[0]+(x if relative else 0);p.lineTo(x,y)
        elif cmd=='V':y=values[0]+(y if relative else 0);p.lineTo(x,y)
    c.drawPath(p,fill=1,stroke=0,fillMode=0)


def draw_art(c,layers,x,y,w,h):
    c.saveState();c.translate(x,y+h);c.scale(w/1024,-h/1536)
    for name in ['black','pink']:
        c.setFillColor(BLACK if name=='black' else PINK)
        for data,transform in layers[name]:
            c.saveState()
            if transform:
                if not transform.startswith('translate('):raise ValueError('Unexpected SVG transform')
                values=list(map(float,re.findall(NUMBER,transform)))
                c.translate(values[0],values[1] if len(values)>1 else 0)
            draw_path(c,data);c.restoreState()
    c.restoreState()


def cover(path,layers,profile,proof=False):
    width,height=[v*72 for v in profile['full_cover_inches']]
    bleed=profile['cover_bleed_inches']*72;spine=profile['spine_inches']*72
    c=canvas.Canvas(str(path),pagesize=(width,height),initialFontName='A305XBold')
    c.setTitle("I Don't Give a Flying Fluck - A305X - KDP cover candidate")
    c.setAuthor('A305X');c.setSubject('Proposed 6 x 9 paperback, 190 black-and-white pages on white paper. Not submitted or proof approved.')
    c.setFillColor(PAPER);c.rect(0,0,width,height,stroke=0,fill=1)
    back=(bleed+48,height-bleed-18-504,336,504)
    front=(bleed+432+spine+18,bleed+27,396,594)
    draw_art(c,layers['back'],*back);draw_art(c,layers['front'],*front)
    # Barcode space contains no invented code, ISBN, price, or printed label.
    box=(bleed+432-162,bleed+18,144,86.4)
    c.setFillColor(CMYKColor(0,0,0,0));c.rect(*box,stroke=0,fill=1)
    c.saveState();c.translate(bleed+432+spine/2,height/2);c.rotate(90)
    c.setFillColor(BLACK);c.setFont('A305XBold',9);c.drawCentredString(0,-3.1,'A305X / FLYING FLUCK');c.restoreState()
    if proof:
        c.setStrokeColor(CMYKColor(1,.4,0,0));c.setLineWidth(.45);c.setDash(3,3)
        c.rect(bleed,bleed,width-2*bleed,height-2*bleed,stroke=1,fill=0)
        for x in [bleed+432,bleed+432+spine]:c.line(x,bleed,x,height-bleed)
        c.rect(*box,stroke=1,fill=0);c.setDash()
        c.setFillColor(BLACK);c.setFont('A305XBold',8)
        c.drawString(bleed+18,bleed+128,'BARCODE SPACE / KDP PLACES THE CODE')
        c.drawString(bleed+18,height-bleed-12,'LAYOUT REVIEW ONLY / PROPOSED KDP WHITE-PAPER PROFILE')
    c.showPage();c.save()
    r=PdfReader(path);w=PdfWriter();w.clone_document_from_reader(r)
    w.pages[0].trimbox=RectangleObject([bleed,bleed,width-bleed,height-bleed])
    w.pages[0].bleedbox=RectangleObject([0,0,width,height])
    if not proof:w.metadata=None
    w.write(path)
    return {'back_art_pt':back,'front_art_pt':front,'barcode_pt':box}


def editable_svg(path,layers,profile):
    w,h=[v*72 for v in profile['full_cover_inches']];b=9;s=profile['spine_inches']*72
    root=ET.Element('svg',xmlns=SVG,width=f'{profile["full_cover_inches"][0]*25.4}mm',height=f'{profile["full_cover_inches"][1]*25.4}mm',viewBox=f'0 0 {w} {h}')
    ET.SubElement(root,'title').text='A305X proposed KDP cover - vector production derivative'
    ET.SubElement(root,'desc').text='Faithful silhouette trace from recovered artwork. Flat ivory replaces photographed paper texture. Proposed profile; preview and physical proof pending.'
    ET.SubElement(root,'rect',width=str(w),height=str(h),fill='#fcf8ee')
    for name,x,y,ww,hh in [('back',b+48,b+18,336,504),('front',b+432+s+18,b+27,396,594)]:
        g=ET.SubElement(root,'g',id=f'{name}-artwork',transform=f'translate({x},{y}) scale({ww/1024},{hh/1536})')
        for color in ['black','pink']:
            cg=ET.SubElement(g,'g',fill='#000000' if color=='black' else '#ff0099')
            for data,transform in layers[name][color]:
                attributes={'d':data,'fill-rule':'evenodd'}
                if transform:attributes['transform']=transform
                ET.SubElement(cg,'path',attributes)
    ET.SubElement(root,'rect',x=str(b+432-162),y=str(h-b-18-86.4),width='144',height='86.4',fill='#ffffff')
    spine=ET.SubElement(root,'text',x='0',y='3.1',transform=f'translate({b+432+s/2},{h/2}) rotate(-90)',fill='#000000',style='font-family:DejaVu Sans;font-weight:bold;font-size:9px;text-anchor:middle')
    spine.text='A305X / FLYING FLUCK'
    guides=ET.SubElement(root,'g',id='guides',display='none',fill='none',stroke='#1684ab',attrib={'stroke-width':'.45','stroke-dasharray':'3 3'})
    ET.SubElement(guides,'rect',x=str(b),y=str(b),width=str(w-2*b),height=str(h-2*b))
    for x in [b+432,b+432+s]:ET.SubElement(guides,'line',x1=str(x),y1=str(b),x2=str(x),y2=str(h-b))
    ET.ElementTree(root).write(path,encoding='utf-8',xml_declaration=True)


def guide(path,profile,quality):
    c=canvas.Canvas(str(path),pagesize=(612,792));c.setTitle('A305X KDP candidate - production settings');c.setAuthor('A305X')
    c.setFillColor(BLACK);c.setFont('A305XBold',26);c.drawString(44,738,'THE FLOCK, ON PAPER.')
    c.setFont('A305XBold',11);c.drawString(44,707,'KDP PAPERBACK CANDIDATE / PROPOSED SETUP')
    rows=[('Finished size','6 x 9 inches / 152.4 x 228.6 mm'),('Interior','190 pages / black-and-white / white paper / no bleed'),('Cover finish','Matte (working default, not user-confirmed)'),('Spine','190 x 0.002252 inches = 0.42788 inches / 10.868152 mm'),('Full wrap','12.67788 x 9.25 inches / 322.018152 x 234.95 mm'),('Bleed','0.125 inch on top, bottom and outer cover edges'),('Barcode','Clear 2 x 1.2 inch white area; KDP supplies the code'),('Cover artwork','Original black/pink silhouettes traced to vector paths'),('Layout change','Back artwork fitted above the barcode; front bird remains small'),('Paper field','Uniform ivory replaces the source image paper texture'),('Profile status','Prepared as a working target; print options are unconfirmed'),('Release status','KDP Previewer and physical proof pending; orders stay closed')]
    rows.insert(2,('Interior export','Embedded fonts; 0.75 pt minimum rules; no digital bookmarks'))
    y=663
    for label,value in rows:
        c.setFont('A305XBold',9);c.drawString(44,y,label.upper())
        c.setFont('Helvetica',10);c.drawString(44,y-17,value);y-=39
    c.setFont('A305XBold',10);c.drawString(44,135,'NEXT: USE THESE SETTINGS IN KDP PRINT PREVIEWER')
    c.setFont('Helvetica',9)
    c.drawString(44,117,'Changing the paper, trim, binding or page count requires a new cover calculation.')
    c.drawString(44,102,'Verify the matte finish and proof copy before publishing. Price remains unconfirmed.')
    c.setFont('Helvetica',7);c.drawString(44,67,'Requirements checked 2026-10-14: kdp.amazon.com/en_US/help/topic/G201953020')
    c.drawString(44,56,'Barcode: /G5HDYGP4BXLX4RUW     Interior margins: /GVBQ3CMEQW3W2VL6')
    c.showPage();c.save()


def print_interior(source,destination):
    """Keep page content and geometry; remove digital-only PDF features."""
    reader=PdfReader(source);writer=PdfWriter();writer.clone_document_from_reader(reader)
    writer.metadata=None
    for key in ['/Outlines','/PageMode','/OpenAction','/Names']:
        writer.root_object.pop(key,None)
    changes={'thin_strokes_strengthened':0,'gray_color_operators':0,'unused_font_references_removed':0}
    for page in writer.pages:
        content=ContentStream(page.get_contents(),writer)
        used=set();font=None
        for operands,operator in content.operations:
            if operator==b'Tf':font=operands[0]
            if operator in [b'Tj',b'TJ',b"'",b'"']:used.add(font)
        fonts=page['/Resources']['/Font']
        unused=set(fonts)-used
        for key in unused:del fonts[key]
        changes['unused_font_references_removed']+=len(unused)
        result=[];block=[]
        for operands,operator in content.operations:
            if operator==b'w' and float(operands[0])<.75:
                operands=[FloatObject(.75)];changes['thin_strokes_strengthened']+=1
            if operator in [b'rg',b'RG']:
                channels=list(map(float,operands))
                if max(channels)-min(channels)>1e-6:raise ValueError('Color in black-and-white interior')
                operands=[FloatObject(channels[0])];operator=b'g' if operator==b'rg' else b'G'
                changes['gray_color_operators']+=1
            if operator==b'Tf' and operands[0] in unused:continue
            if operator==b'BT':block=[(operands,operator)];continue
            if block:
                block.append((operands,operator))
                if operator==b'ET':
                    if any(op in [b'Tj',b'TJ',b"'",b'"'] for _,op in block):result.extend(block)
                    block=[]
            else:result.append((operands,operator))
        assert not block
        content.operations=result;page.replace_contents(content)
        page.pop('/Annots',None)
    writer.write(destination)
    return changes


def main():
    p=argparse.ArgumentParser();p.add_argument('--artwork-dir',type=Path,required=True);p.add_argument('--interior',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();profile=json.loads((ROOT/'kdp-candidate.json').read_text())
    if len(PdfReader(a.interior).pages)!=190:raise ValueError('Interior page count changed; recalculate the spine.')
    assert abs(profile['spine_inches']-190*profile['spine_coefficient_inches_per_page'])<1e-9
    assert not profile['user_confirmed_print_options'] and not profile['purchasing_enabled']
    a.output.mkdir(parents=True,exist_ok=True)
    font_dir=Path(os.environ.get('A305X_FONT_DIR','/usr/share/fonts/truetype/dejavu'))
    pdfmetrics.registerFont(TTFont('A305XBold',str(font_dir/'DejaVuSans-Bold.ttf')))
    layers={};quality={}
    with tempfile.TemporaryDirectory() as temp:
        for name in ['front','back']:layers[name],quality[name]=trace(a.artwork_dir/f'{name}-original.png',Path(temp))
    geometry=cover(a.output/'A305X_Flying_Fluck_KDP_Cover_CANDIDATE.pdf',layers,profile)
    cover(a.output/'A305X_Flying_Fluck_KDP_Cover_Layout_REVIEW.pdf',layers,profile,proof=True)
    editable_svg(a.output/'A305X_Flying_Fluck_KDP_Cover_Editable.svg',layers,profile)
    guide(a.output/'A305X_Flying_Fluck_KDP_Setup.pdf',profile,quality)
    interior_changes=print_interior(a.interior,a.output/'A305X_Flying_Fluck_KDP_Interior_190p.pdf')
    report={'profile':profile,'trace_quality':quality,'geometry':geometry,'source_sha256':{n:hashlib.sha256((a.artwork_dir/f'{n}-original.png').read_bytes()).hexdigest() for n in ['front','back']},'interior_source_sha256':hashlib.sha256(a.interior.read_bytes()).hexdigest(),'interior_preflight':interior_changes,'cover_raster_images':0,'new_native_raster_detail_claimed':False}
    (a.output/'production-report.json').write_text(json.dumps(report,indent=2)+'\n')
    shutil.copy2(ROOT/'kdp-candidate.json',a.output/'proposed-print-profile.json')
    print(json.dumps({'spine_inches':profile['spine_inches'],'wrap_inches':profile['full_cover_inches'],'trace_quality':quality},indent=2))


if __name__=='__main__':main()
