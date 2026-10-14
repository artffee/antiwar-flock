"""Preflight the actual candidate PDFs, without claiming KDP acceptance."""
import argparse
import hashlib
import json
from pathlib import Path

import fitz
import numpy as np
from PIL import Image
from pypdf import PdfReader
from pypdf.generic import ContentStream

ROOT=Path(__file__).resolve().parent
p=argparse.ArgumentParser()
p.add_argument('--candidate',type=Path,required=True)
p.add_argument('--source-interior',type=Path,required=True)
p.add_argument('--artwork-dir',type=Path,required=True)
a=p.parse_args()
profile=json.loads((ROOT/'kdp-candidate.json').read_text())
report=json.loads((a.candidate/'production-report.json').read_text())
assert report['profile']==profile
assert not profile['user_confirmed_print_options']
assert not profile['print_previewer_passed'] and not profile['physical_proof_approved']
assert profile['price_usd'] is None and not profile['purchasing_enabled']
assert abs(profile['spine_inches']-profile['interior_pages']*.002252)<1e-9
assert report['interior_source_sha256']==hashlib.sha256(a.source_interior.read_bytes()).hexdigest()
for cover in report['trace_quality'].values():
    for ink in cover.values():
        assert ink['native_mask_iou']>=.995
        assert all(value>=.98 for value in ink['regions'].values())

checks=0
def check(condition,detail):
    global checks
    assert condition,detail
    checks+=1

def box_equal(actual,expected):
    return all(abs(x-y)<.001 for x,y in zip(map(float,actual),expected))

def fonts_embedded(page):
    for font in page['/Resources']['/Font'].values():
        obj=font.get_object()
        descriptor=obj.get('/FontDescriptor')
        check(descriptor is not None,'Unembedded standard font')
        descriptor=descriptor.get_object()
        check(bool(descriptor.get('/FontFile2') or descriptor.get('/FontFile3') or descriptor.get('/FontFile')),'Missing font bytes')

paths=[a.candidate/'A305X_Flying_Fluck_KDP_Cover_CANDIDATE.pdf',a.candidate/'A305X_Flying_Fluck_KDP_Interior_190p.pdf']
width,height=[v*72 for v in profile['full_cover_inches']]
documents=[]
for path,count,size in zip(paths,[1,190],[(width,height),(432,648)]):
    reader=PdfReader(path);doc=fitz.open(path);documents.append(doc)
    check(len(reader.pages)==count,f'{path.name}: page count')
    check(reader.metadata is None,'Submission PDF metadata')
    check(not reader.outline,'Submission PDF digital bookmarks')
    check(not reader.is_encrypted,'Encrypted PDF')
    for number,page in enumerate(reader.pages,1):
        check(box_equal(page.mediabox,[0,0,*size]),f'{path.name}: page {number} size')
        check(not page.get('/Annots'),'Submission PDF annotations')
        check(not page.images,'Raster artwork in vector candidate')
        check('/ExtGState' not in page['/Resources'],'Unexpected transparency state')
        fonts_embedded(page)

cover_reader=PdfReader(paths[0]);cover=documents[0][0]
check(box_equal(cover_reader.pages[0].trimbox,[9,9,width-9,height-9]),'Cover trim box')
check(box_equal(cover_reader.pages[0].bleedbox,[0,0,width,height]),'Cover bleed box')
check('LAYOUT REVIEW' not in cover.get_text(),'Review text in submission PDF')
check(all(d['type']=='f' for d in cover.get_drawings()),'Cover has guide strokes')
check(not any(op in [b'rg',b'RG',b'g',b'G'] for _,op in ContentStream(cover_reader.pages[0].get_contents(),cover_reader).operations),'Cover color space is not CMYK')
for block in cover.get_text('dict')['blocks']:
    for line in block.get('lines',[]):
        x0,y0,x1,y1=line['bbox']
        check(x0>=441+4.5 and x1<=441+profile['spine_inches']*72-4.5,'Spine text clearance')
        check(all(span['size']>=7 for span in line['spans']),'Small spine type')
back=report['geometry']['back_art_pt'];front=report['geometry']['front_art_pt'];barcode=report['geometry']['barcode_pt']
check(back[1]>barcode[1]+barcode[3],'Back art overlaps barcode area')
check(barcode==[279,27,144,86.4],'Barcode geometry')
check(front[0]>=441+profile['spine_inches']*72+18,'Front spine-safe inset')
rectangle=fitz.Rect(barcode[0],height-barcode[1]-barcode[3],barcode[0]+barcode[2],height-barcode[1])
sample=cover.get_pixmap(matrix=fitz.Matrix(1,1),clip=rectangle+(.5,.5,-.5,-.5),colorspace=fitz.csRGB,alpha=False)
check(all(channel==255 for channel in sample.samples),'Barcode area is not clear white')

# Compare the actual composed PDF with the recovered source on its native grid.
# This also verifies the SVG-to-PDF path parser, transforms and fill rules.
def ink_masks(rgb):
    red,green,blue=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
    pink=(red-green>80)&(blue-green>35)&(red>140)
    return {'pink':pink,'black':(red<160)&(green<160)&(blue<160)&~pink}

composed_quality={}
for name in ['front','back']:
    original=a.artwork_dir/f'{name}-original.png'
    check(hashlib.sha256(original.read_bytes()).hexdigest()==report['source_sha256'][name],f'{name} source identity')
    expected=ink_masks(np.asarray(Image.open(original).convert('RGB')).astype(np.int16))
    x,y,w,h=report['geometry'][f'{name}_art_pt']
    native=fitz.open();page=native.new_page(width=1024,height=1536)
    page.show_pdf_page(page.rect,documents[0],0,clip=fitz.Rect(x,height-y-h,x+w,height-y))
    pix=page.get_pixmap(alpha=False)
    actual=ink_masks(np.frombuffer(pix.samples,np.uint8).reshape(1536,1024,3).astype(np.int16))
    composed_quality[name]={}
    for ink in ['black','pink']:
        one,two=expected[ink],actual[ink]
        score=float((one&two).sum()/max((one|two).sum(),1))
        check(score>=.995,f'{name}/{ink} PDF silhouette changed')
        composed_quality[name][ink]=score
    native.close()

source=fitz.open(a.source_interior);interior=documents[1];interior_reader=PdfReader(paths[1])
minimum_width=10
for i,page in enumerate(interior):
    check(page.get_text()==source[i].get_text(),f'Interior text changed on page {i+1}')
    check(not any(op in [b'rg',b'RG',b'k',b'K'] for _,op in ContentStream(interior_reader.pages[i].get_contents(),interior_reader).operations),f'Page {i+1} colors are not DeviceGray')
    left,right=(18*72/25.4,396) if (i+1)%2 else (36,432-18*72/25.4)
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines',[]):
            x0,y0,x1,y1=line['bbox']
            check(x0>=left-.75 and x1<=right+.75 and y0>=36 and y1<=612.1,f'Page {i+1} text margins')
            check(all(span['size']>=7 for span in line['spans']),f'Page {i+1} small text')
    for drawing in page.get_drawings():
        check(drawing['width']>=.75,f'Page {i+1} thin rule')
        minimum_width=min(minimum_width,drawing['width'])
        rect=drawing['rect'];half=drawing['width']/2
        min_left,max_right=(36,414) if (i+1)%2 else (18,396)
        check(rect.x0-half>=min_left and rect.x1+half<=max_right and rect.y0-half>=18 and rect.y1+half<=630,f'Page {i+1} drawing outside KDP margins')

result={'checks':checks,'cover_pages':1,'interior_pages':190,'exact_wrap_inches':profile['full_cover_inches'],'spine_inches':profile['spine_inches'],'all_fonts_embedded':True,'raster_images':0,'rendered_pdf_native_mask_iou':composed_quality,'clear_barcode_area':True,'interior_text_unchanged':True,'mirrored_text_margins':True,'minimum_rule_width_pt':minimum_width,'submission_guides_metadata_annotations_bookmarks':False,'print_previewer_passed':False,'physical_proof_approved':False}
(a.candidate/'verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
