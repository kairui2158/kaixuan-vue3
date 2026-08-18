import os
import zipfile

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "p2_samples")
os.makedirs(OUT, exist_ok=True)

def write(name, data):
    with open(os.path.join(OUT, name), "wb" if isinstance(data, bytes) else "w", encoding="utf-8" if not isinstance(data, bytes) else None) as f:
        f.write(data)
    print("WROTE", name)

write("sample.txt", "星海神意 TXT 导入测试\n第二行内容\n第三行")
write("sample.md", "# 星海神意 MD 导入测试\n\n段落一\n\n- 要点1\n- 要点2\n")
write("sample.rtf", "{\\rtf1\\ansi\\ansicpg936\\deff0\n{\\fonttbl{\\f0 SimSun;}}\n\\f0\\fs24 星海神意 RTF 导入测试\\par\n第二段内容\\par\n}\n".encode("gbk"))

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
"""
RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
"""
DOCUMENT = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>星海神意 DOCX 导入测试</w:t></w:r></w:p>
    <w:p><w:r><w:t>第二段内容</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>
"""

def make_docx(path, compression):
    with zipfile.ZipFile(path, "w", compression=compression) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("word/document.xml", DOCUMENT)
    print("WROTE", path)

make_docx(os.path.join(OUT, "sample_stored.docx"), zipfile.ZIP_STORED)
make_docx(os.path.join(OUT, "sample_deflate.docx"), zipfile.ZIP_DEFLATED)
write("sample.doc", "this is a legacy doc placeholder")
