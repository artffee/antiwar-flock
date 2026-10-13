"""Build editable Flying Fluck layout proofs. Never infer a printer's spine.

Usage: python3 build.py --artwork-dir /absolute/source --output /absolute/output
The physical template uses provisional settings.json values. It is not a press file.
Full product PDFs are deliberately generated outside the website checkout.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import math
import os
import tempfile
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject
from reportlab.lib.colors import Color, HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import Font
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent
MM = 72 / 25.4
INK = HexColor('#121212')
PAPER = HexColor('#fcf8ee')
W, H = 432, 648


def register_fonts():
    fonts = Path(os.environ.get('A305X_FONT_DIR', '/usr/share/fonts/truetype/dejavu'))
    for name, file in [('Body', 'DejaVuSans.ttf'), ('Bold', 'DejaVuSans-Bold.ttf'), ('Mono', 'DejaVuSansMono.ttf')]:
        path = fonts / file
        if not path.is_file():
            raise ValueError('DejaVu fonts required; set A305X_FONT_DIR to their directory.')
        pdfmetrics.registerFont(TTFont(name, str(path)))


def line(c, text, x, y, size=11, font='Body', max_width=None):
    if max_width:
        while pdfmetrics.stringWidth(text, font, size) > max_width:
            size -= .25
            if size < 6:
                raise ValueError(f'Text will not fit: {text}')
    c.setFillColor(INK)
    c.setFont(font, size)
    c.drawString(x, y, text)


def wrap(text, font, size, width):
    result, current = [], ''
    for word in text.split():
        test = (current + ' ' + word).strip()
        if current and pdfmetrics.stringWidth(test, font, size) > width:
            result.append(current)
            current = word
        else:
            current = test
    if current:
        result.append(current)
    return result


def paragraph(c, text, x, y, width, size=11, leading=17, font='Body'):
    for value in wrap(text, font, size, width):
        line(c, value, x, y, size, font)
        y -= leading
    return y


def rule(c, x1, y, x2, shade=.80, width=.5):
    c.setStrokeColor(Color(shade, shade, shade))
    c.setLineWidth(width)
    c.line(x1, y, x2, y)


def frame(c, n, section, config):
    layout = config['layout']
    inside = layout['interior_inside_mm'] * MM
    outside = layout['interior_outside_mm'] * MM
    # Odd-numbered interior pages are right-hand pages. PDF reading order is
    # retained; a printer performs imposition for its own binding workflow.
    left, right = (inside, W-outside) if n % 2 else (outside, W-inside)
    line(c, 'A305X / FLYING FLUCK', left, H-46, 7.5, 'Mono')
    c.setFont('Mono', 7.5)
    c.drawRightString(right, H-46, section.upper())
    rule(c, left, H-57, right, .15, .7)
    rule(c, left, 50, right)
    line(c, 'LESS NOISE. MORE YOU.', left, 38, 7, 'Mono')
    c.setFont('Mono', 7)
    c.drawRightString(right, 38, f'{n:03}')
    return left, right


def heading(c, title, x, y, width, subtitle=None):
    for value in title.split('\n'):
        line(c, value, x, y, 30, 'Bold', width)
        y -= 35
    if subtitle:
        y -= 7
        y = paragraph(c, subtitle, x, y, width, 10.5, 16)
    return y


def writing_box(c, label, x, top, width, height=104):
    c.setStrokeColor(HexColor('#b4b4b4'))
    c.setLineWidth(.6)
    c.roundRect(x, top-height, width, height, 7, stroke=1, fill=0)
    line(c, label, x+12, top-21, 8.5, 'Bold', width-24)
    for y in range(round(top-42), round(top-height+12), -18):
        rule(c, x+12, y, x+width-12, .84)


def build_interior(path, data, config):
    c = canvas.Canvas(str(path), pagesize=(W,H))
    c.setTitle("A305X - I Don't Give a Flying Fluck - 190-page interior layout proof")
    c.setAuthor('A305X')
    c.setSubject('Provisional 6 x 9 inch non-bleed interior. Printer, binding and stock pending.')
    n = 1
    x, right = frame(c,n,'Start here',config); width = right-x
    c.bookmarkPage('start'); c.addOutlineEntry('Start here','start',0)
    y = heading(c,'HOW TO USE\nTHIS THING.',x,H-105,width,'Five honest minutes. No audience required.')
    for label, text in data['instructions']:
        y -= 30
        line(c,label,x,y,10,'Bold')
        y = paragraph(c,text,x,y-20,width,11,17)
    y -= 26
    paragraph(c,'Skip days without guilt. Return without explanation.',x,y,width,10,16)
    c.showPage(); n += 1
    for index, section in enumerate(data['sections'],1):
        name = section['name']; key = name.lower()
        x, right = frame(c,n,name,config); width = right-x
        c.bookmarkPage(key); c.addOutlineEntry(name,key,0)
        line(c,f'0{index} / YOUR PERSONAL REBELLION',x,H-105,9,'Mono',width)
        heading(c,section['title'],x,H-175,width,section['tagline'])
        paragraph(c,'42 guided writing pages. Six weekly resets. One place to find your own signal.',x,250,width,11,18)
        paragraph(c,'Care deeply. Choose wisely. Keep the peace.',x,160,width,12,18,'Bold')
        c.showPage(); n += 1

        x, right = frame(c,n,name,config); width = right-x
        heading(c,'ENERGY CHECK',x,H-105,width,'Plot what is left. A blank day can stay blank.')
        gx, gy, gh = x+27, 210, 220
        gw = width-27
        for k in range(5):
            y = gy + k*gh/4
            rule(c,gx,y,gx+gw,.78)
            line(c,str(k*25),x,y-3,7,'Mono')
        for k in range(42):
            xpos = gx+k*gw/41
            c.setStrokeColor(Color(.9,.9,.9)); c.setLineWidth(.35)
            c.line(xpos,gy,xpos,gy+gh)
        for k in range(6):
            line(c,f'WK {k+1}',gx+k*gw/6,gy-22,8,'Mono')
        paragraph(c,'Connect one point per day. Notice the pattern; leave the judgement outside.',x,135,width,10,16)
        c.showPage(); n += 1

        x, right = frame(c,n,name,config); width = right-x
        heading(c,'THE RECEIPTS',x,H-105,width,'The tally does not judge. It reveals the pattern.')
        labels=['Days logged / 42','Boundaries held','Priorities kept','Things released','Average energy left / %']
        for k,label in enumerate(labels):
            yy = 430-k*46
            line(c,label,x,yy,10)
            rule(c,x+width*.69,yy-4,right,.35,.6)
        writing_box(c,'WHAT THIS SECTION REVEALED',x,178,width,96)
        c.showPage(); n += 1

        x, right = frame(c,n,name,config); width = right-x
        heading(c,'VIBE CHECK',x,H-105,width,'One mark per day. No explanation required.')
        states=['On fire','Steady','Offline','Overload']
        for k,label in enumerate(states):
            xx = x+(k%2)*width/2; yy=453-(k//2)*26
            c.setStrokeColor(INK); c.setLineWidth(.6); c.circle(xx+4,yy+3,4,stroke=1,fill=0)
            line(c,label,xx+16,yy,10)
        cell=(width-39)/7
        for col in range(7):
            line(c,str(col+1),x+46+col*cell,370,9,'Mono')
        for row in range(6):
            yy=340-row*36
            line(c,f'WK {row+1}',x,yy,8,'Mono')
            for col in range(7):
                c.setStrokeColor(HexColor('#777777'));c.roundRect(x+39+col*cell,yy-8,cell-7,24,4,stroke=1,fill=0)
        paragraph(c,'Write O, S, F or X - or use your own symbols. This is your page.',x,100,width,10,16)
        c.showPage(); n += 1

        for day, entry in enumerate(section['entries'],1):
            x, right = frame(c,n,name,config); width = right-x
            line(c,f'SECTION 0{index} / ENTRY {day:02}',x,H-83,8,'Mono')
            heading(c,entry['title'],x,H-120,width,entry['subtitle'])
            for k,prompt in enumerate(entry['prompts']):
                writing_box(c,prompt,x,431-k*114,width,104)
            line(c,'ENERGY LEFT',x,72,8,'Mono')
            for k in range(10):
                xx=x+100+k*18
                c.setStrokeColor(HexColor('#555555'));c.roundRect(xx,67,12,12,2,stroke=1,fill=0)
            c.showPage(); n += 1

        x, right = frame(c,n,name,config); width = right-x
        heading(c,'LET IT FLY.',x,H-105,width,'Keep the wisdom. Let the weight take flight.')
        for k,label in enumerate(['WHAT HAPPENED - FACTS ONLY','WHAT IT REVEALED','WHAT I RELEASE','WHAT I CHOOSE NOW']):
            writing_box(c,label,x,445-k*88,width,79)
        c.showPage(); n += 1

    x, right = frame(c,n,'Notes',config); width=right-x
    c.bookmarkPage('notes');c.addOutlineEntry('Notes','notes',0)
    heading(c,'EXTRA ROOM.\nFOR YOU.',x,H-105,width,'Ideas, plans, and things you are ready to let fly.')
    for y in range(428,72,-20):rule(c,x,y,right,.83)
    c.showPage(); n += 1
    if n-1 != config['interior_page_count']:raise ValueError(f'Interior page count changed: {n-1}')
    c.save()
    r=PdfReader(path); out=PdfWriter()
    out.clone_document_from_reader(r)
    for p in out.pages:
        p.trimbox=RectangleObject([0,0,W,H]);p.bleedbox=RectangleObject([0,0,W,H])
    out.write(path)


def fitted_art(c,path,x,y,w,h,margin):
    # Retain the entire raster and its aspect ratio. The uniform cream bleed
    # is layout, not invented artwork or a fake increase in native resolution.
    c.setFillColor(PAPER);c.rect(x,y,w,h,stroke=0,fill=1)
    scale=min((w-2*margin)/1024,(h-2*margin)/1536)
    iw,ih=1024*scale,1536*scale
    c.drawImage(str(path),x+(w-iw)/2,y+(h-ih)/2,iw,ih)


def build_cover_proof(path,art,config):
    w,h=[v*72 for v in config['layout']['trim_inches']]
    bleed=config['layout']['cover_bleed_mm']*MM;safe=config['layout']['cover_safe_mm']*MM
    slug=36
    pw,ph=w+2*bleed+2*slug,h+2*bleed+2*slug
    c=canvas.Canvas(str(path),pagesize=(pw,ph))
    c.setTitle('A305X - Front and back cover layout proof - NOT FOR PRESS')
    c.setAuthor('A305X')
    for name in ['front','back']:
        bx,by=slug,slug;tx,ty=slug+bleed,slug+bleed
        c.setFillColor(PAPER);c.rect(bx,by,w+2*bleed,h+2*bleed,stroke=0,fill=1)
        fitted_art(c,art[name],tx,ty,w,h,safe)
        c.setFillColor(INK)
        line(c,f'{name.upper()} / LAYOUT PROOF / NOT FOR PRESS',slug,ph-20,8,'Mono')
        line(c,'6 x 9 in draft trim / 3.175 mm provisional bleed / 6.35 mm safe',slug,17,7,'Mono',pw-2*slug)
        # Trim marks lie outside the bleed. Dashed safe marks are QA only.
        c.setStrokeColor(INK);c.setLineWidth(.5)
        for xx in [tx,tx+w]:
            c.line(xx,by-11,xx,by-3);c.line(xx,by+h+2*bleed+3,xx,by+h+2*bleed+11)
        for yy in [ty,ty+h]:
            c.line(bx-11,yy,bx-3,yy);c.line(bx+w+2*bleed+3,yy,bx+w+2*bleed+11,yy)
        c.setStrokeColor(HexColor('#aa527a'));c.setDash(3,3)
        c.rect(tx+safe,ty+safe,w-2*safe,h-2*safe,stroke=1,fill=0)
        c.setDash();c.showPage()
    c.save()
    r=PdfReader(path);out=PdfWriter();out.clone_document_from_reader(r)
    for p in out.pages:
        p.trimbox=RectangleObject([slug+bleed,slug+bleed,slug+bleed+w,slug+bleed+h])
        p.bleedbox=RectangleObject([slug,slug,slug+w+2*bleed,slug+h+2*bleed])
    out.write(path)


def write_svg(path,source,config):
    w,h=[v*25.4 for v in config['layout']['trim_inches']]
    b=config['layout']['cover_bleed_mm'];s=config['layout']['cover_safe_mm']
    iw=w-2*s;ih=iw*1.5;x=b+s;y=b+(h-ih)/2
    data=base64.b64encode(source.read_bytes()).decode()
    path.write_text(f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w+2*b}mm" height="{h+2*b}mm" viewBox="0 0 {w+2*b} {h+2*b}">
  <title>A305X editable cover layout proof; printer settings pending</title>
  <desc>Entire approved raster retained at native resolution. Bleed and safe values are draft layout defaults. Not a press-ready cover. Guide layer is hidden by default.</desc>
  <g id="background-bleed"><rect width="{w+2*b}" height="{h+2*b}" fill="#fcf8ee"/></g>
  <g id="approved-artwork"><image x="{x}" y="{y}" width="{iw}" height="{ih}" href="data:image/png;base64,{data}"/></g>
  <g id="guides" display="none" fill="none" stroke-width=".25">
    <rect id="trim" x="{b}" y="{b}" width="{w}" height="{h}" stroke="#006e9b"/>
    <rect id="safe" x="{b+s}" y="{b+s}" width="{w-2*s}" height="{h-2*s}" stroke="#ad1457" stroke-dasharray="2 2"/>
  </g>
</svg>''')


def build_guide(path,config):
    c=canvas.Canvas(str(path),pagesize=(612,792));c.setTitle('A305X - Physical print specification worksheet');c.setAuthor('A305X')
    def title(page,name):
        line(c,'A305X / FLYING FLUCK / PRINT WORKSHEET',44,748,8,'Mono')
        heading(c,name,44,696,524)
        rule(c,44,60,568);line(c,'LAYOUT PROOF / PRINTER CONFIRMATION REQUIRED',44,42,8,'Mono')
        c.setFont('Mono',8);c.drawRightString(568,42,str(page))
    title(1,'THE ART IS FOUND.\nTHE PRINTER IS PENDING.')
    y=584
    for label,text in [
        ('Artwork','Original October 13 sculpted-lettering front and matching Less noise. More you. back. The tiny wired flamingo and typography are preserved.'),
        ('Digital file','192 pages including the two covers. The separate interior contains 190 pages and 168 guided writing pages across four sections.'),
        ('Print layout','6 x 9 inches is inherited from the existing digital file. It is a draft physical trim, not a confirmed printer order.'),
        ('Cover resolution','Both native originals are 1024 x 1536 pixels: 170.7 dpi across 6 x 9 inches. The inset proof is about 186 dpi. No upsampling is presented as new detail.'),
        ('Status','The proof PDFs and editable SVGs support review and adjustment. A production cover and a final press export await a printer template, binding, paper, accepted image resolution and color workflow.')]:
        line(c,label.upper(),44,y,9,'Bold');y=paragraph(c,text,44,y-20,524,11,17)-25
    c.showPage()
    title(2,'DIMENSIONS\nWITHOUT GUESSWORK.')
    y=579
    for label,text in [
        ('Draft cover panels','Trim: 152.4 x 228.6 mm (6 x 9 inches). Template including provisional bleed: 158.75 x 234.95 mm (6.25 x 9.25 inches). Bleed default: 3.175 mm at each outer edge.'),
        ('Safe area','Draft cover safe inset: 6.35 mm from trim. The complete artwork is fitted inside this region without cropping. SVG guides are on a separate hidden layer; PDF guides are for review only.'),
        ('Interior','190 single pages in reading order, not imposed sheets. Inside margin: 18 mm; outside: 12.7 mm; top/bottom: 15.24 mm. Odd pages have the gutter on the left; even pages on the right. No interior bleed is needed for this white, inset layout.'),
        ('Spine: pending','190 interior pages = 95 leaves. Thickness depends on the actual stock, binding and the printer. Do not count the two separate cover panels as interior pages.'),
        ('Paperback formula only','If the printer confirms a perfect-bound paperback: full-wrap width = 2 x trim width + spine + 2 x outer bleed. With these draft panels: width = 311.15 mm + spine in mm. Height = 234.95 mm (9.25 inches). The spine must come from the printer.'),
        ('Other bindings','A hardcover needs the printer-specific case, hinge, board and turn-in template. A spiral notebook needs binding-hole clearance and separate panels. Neither can use the paperback spine formula unchanged.')]:
        line(c,label.upper(),44,y,9,'Bold');y=paragraph(c,text,44,y-20,524,10,14)-14
    c.showPage()
    title(3,'BEFORE THE\nPRINT RUN.')
    y=582
    for label in ['PRINTER / TEMPLATE REFERENCE','BINDING / FINISHED TRIM','PAPER STOCK / APPROVED INTERIOR PAGE COUNT','PRINTER SUPPLIED SPINE / BINDING CLEARANCE','REQUIRED BLEED / SAFE MARGINS','ACCEPTED NATIVE IMAGE RESOLUTION','COLOR PROFILE / EXPORT REQUIREMENTS','PHYSICAL PROOF ACCEPTED / DATE']:
        line(c,label,44,y,9,'Mono');rule(c,44,y-28,568);y-=56
    paragraph(c,'Website sales remain closed. Price, fulfillment, shipping and returns must be confirmed separately before accepting orders.',44,96,524,10,15)
    c.showPage();c.save()


def combine_digital(interior,art,path):
    covers=path.parent/'_digital-cover-pages.pdf'
    c=canvas.Canvas(str(covers),pagesize=(W,H))
    for name in ['front','back']:
        c.drawImage(str(art[name]),0,0,W,H);c.showPage()
    c.save()
    cr=PdfReader(covers);ir=PdfReader(interior);out=PdfWriter()
    out.add_page(cr.pages[0]);out.append(ir,import_outline=False);out.add_page(cr.pages[1])
    out.add_metadata({'/Title':"I Don't Give a Flying Fluck - A305X - Digital layout proof",'/Author':'A305X','/Subject':'192 digital pages. Physical printing specifications unconfirmed.'})
    for name,i in [('Front cover',0),('Start here',1),('Energy',2),('Boundaries',49),('Clarity',96),('Release',143),('Notes',190),('Back cover',191)]:
        out.add_outline_item(name,i)
    out.write(path);covers.unlink()


def validate_release(config,art):
    missing=[]
    if not config['layout']['defaults_are_printer_confirmed']:missing.append('printer-confirmed dimensions, bleed and margins')
    printer=config['printer']
    for key in ['name','binding','paper_stock','template_reference','approved_interior_page_count','minimum_cover_dpi','color_workflow','physical_proof_approved']:
        if not printer.get(key):missing.append(key)
    if printer.get('approved_interior_page_count') != config['interior_page_count']:missing.append('matching 190-page interior approval')
    if printer.get('binding') != 'perfect-bound-paperback':missing.append('this exporter supports only a confirmed perfect-bound paperback')
    spine=printer.get('spine_mm')
    if not isinstance(spine,(int,float)) or not math.isfinite(spine) or spine <= 0:missing.append('positive printer-supplied spine_mm')
    w,h=config['layout']['trim_inches']
    for name,path in art.items():
        iw,ih=Image.open(path).size
        dpi=min(iw/w,ih/h)
        minimum=printer.get('minimum_cover_dpi')
        if not isinstance(minimum,(int,float)) or dpi < minimum:missing.append(f'{name} artwork accepted at actual native {dpi:.1f} dpi')
    if missing:raise ValueError('Final press export is blocked: '+', '.join(missing))
    # Do not pretend to apply an ICC/output-intent workflow via a generic RGB
    # proof exporter. The printer-specific export is the final dependent step.
    raise ValueError('Printer inputs are complete. Export through the confirmed printer color/template workflow; this tool produces layout proofs only.')


def build_website_preview(path,data,config):
    # The website gallery carries the untouched cover images. A small PDF of
    # ten interior pages makes the sample practical on mobile connections.
    # Standard PDF fonts are used only in this online sample. The complete
    # physical interior proof retains its embedded DejaVu fonts.
    for name,face in [('Body','Helvetica'),('Bold','Helvetica-Bold'),('Mono','Courier')]:
        pdfmetrics.registerFont(Font(name,face,'WinAnsiEncoding'))
    with tempfile.TemporaryDirectory() as temp:
        source=Path(temp)/'interior.pdf';build_interior(source,data,config)
        reader=PdfReader(source);preview=PdfWriter()
        for i in [0,1,2,4,5,11,52,99,146,189]:preview.add_page(reader.pages[i])
        preview.add_metadata({'/Title':"I Don't Give a Flying Fluck - A305X - 10 interior-page preview",'/Author':'A305X','/Subject':'Digital sample. Cover gallery online. Physical printing specifications pending.'})
        preview.write(path)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--artwork-dir',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--settings',type=Path,default=ROOT/'settings.json')
    parser.add_argument('--final',action='store_true',help='Check release inputs; never silently emit a proof as a press file')
    args=parser.parse_args()
    checkout=ROOT.parents[1]
    if (checkout/'.git').exists() and args.output.resolve().is_relative_to(checkout):
        raise ValueError('Generate full product proofs outside the public website checkout.')
    config=json.loads(args.settings.read_text());data=json.loads((ROOT/'content.json').read_text())
    art={name:args.artwork_dir/config['artwork'][name] for name in ['front','back']}
    for path in art.values():
        if not path.is_file():raise ValueError(f'Missing approved artwork: {path.name}')
    if args.final:validate_release(config,art)
    if config['layout']['trim_inches'] != [6,9]:raise ValueError('Reflow the interior before changing its measured 6 x 9 inch page size.')
    args.output.mkdir(parents=True,exist_ok=True);register_fonts()
    interior=args.output/'A305X_Flying_Fluck_Interior_190p_PROOF.pdf'
    digital=args.output/'A305X_Flying_Fluck_Digital_192p_PROOF.pdf'
    build_interior(interior,data,config)
    build_cover_proof(args.output/'A305X_Flying_Fluck_Cover_Layout_PROOF.pdf',art,config)
    for name,path in art.items():write_svg(args.output/f'{name}-cover-editable-PROOF.svg',path,config)
    build_guide(args.output/'A305X_Flying_Fluck_Print_Worksheet.pdf',config)
    combine_digital(interior,art,digital)
    dr=PdfReader(digital)
    build_website_preview(args.output/'A305X_Flying_Fluck_Preview_10p.pdf',data,config)
    report={
        'status':'layout-proof-awaiting-printer',
        'interior_pages':len(PdfReader(interior).pages),
        'digital_pages':len(dr.pages),
        'guided_pages':sum(len(s['entries']) for s in data['sections']),
        'spine_mm':None,
        'artwork':{name:{'native_pixels':list(Image.open(path).size),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'native_dpi_at_trim':min(Image.open(path).width/6,Image.open(path).height/9)} for name,path in art.items()},
        'website_checkout_enabled':False,
        'final_press_export':False
    }
    (args.output/'build-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))


if __name__ == '__main__':main()
