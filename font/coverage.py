#!/usr/bin/env python3
"""Coverage report: python3 coverage.py dist/variable/Nemaum-VF.ttf"""
import sys, unicodedata
from fontTools.ttLib import TTFont

KAOMOJI = """(╯°□°）╯︵ ┻━┻ ┬─┬ノ( º _ ºノ) ʕ•ᴥ•ʔ (≧▽≦) ٩(◕‿◕｡)۶ (づ｡◕‿‿◕｡)づ (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧ ☜(ﾟヮﾟ☜)
(╥﹏╥) (๑˃̵ᴗ˂̵)و ಥ_ಥ ಠ_ಠ (◕ᴗ◕✿) ¯\\_(ツ)_/¯ (｡•́︿•̀｡) (・ω・) (*^‿^*) (๑>◡<๑) ヽ(´▽`)/ (ᵔᴥᵔ) (≖‿≖) ♡(ˊᗜˋ)
Σ(°△°|||)︴ ( ͡° ͜ʖ ͡°) (ノಠ益ಠ)ノ彡┻━┻ o(╥﹏╥)o (•‿•) ٩(๑❛ᴗ❛๑)۶ ʕ·ᴥ·ʔ ฅ^•ﻌ•^ฅ (⌒‿⌒) (✿◠‿◠) (´• ω •`)
★☆♥♡♪♬※◎●○◇◆△▲▽▼→←↑↓↔♀♂✓✔✗✘✿❀❁❤ ♠♣♦♤♧♢ ☺☹☻ ☀☁☂☃ ⊙◉ ∀∇∩∪≧≦≥≤ ▁▂▃▄▅▆▇█▉▊▋▌▍▎▏ ⠁⠿⣿ ╭╮╰╯ ─│┌┐└┘├┤┬┴┼
"""


def ks_x_1001_symbols():
    out = []
    for hi in range(0xA1, 0xAD):
        for lo in range(0xA1, 0xFF):
            try:
                ch = bytes([hi, lo]).decode("euc_kr")
            except UnicodeDecodeError:
                continue
            out.append(ch)
    return out


def main(path):
    f = TTFont(path)
    cm = f.getBestCmap()
    print("glyphs:", len(f.getGlyphOrder()), " mapped codepoints:", len(cm))
    han = sum(1 for c in range(0xAC00, 0xD7A4) if c in cm)
    print("Hangul syllables: %d / 11172" % han)
    ascii_ = sum(1 for c in range(0x20, 0x7F) if c in cm)
    print("ASCII printable: %d / 95" % ascii_)
    ks = ks_x_1001_symbols()
    ks_nonhangul = [c for c in ks if not (0xAC00 <= ord(c) <= 0xD7A3)]
    have = [c for c in ks_nonhangul if ord(c) in cm]
    print("KS X 1001 symbols (rows 1-12): %d / %d" % (len(have), len(ks_nonhangul)))
    miss = [c for c in ks_nonhangul if ord(c) not in cm]
    print("  missing (first 120):", "".join(miss[:120]))
    kc = sorted({c for c in KAOMOJI if not c.isspace() and c.strip()})
    km = [c for c in kc if ord(c) not in cm]
    print("Kaomoji sample characters: %d / %d covered" % (len(kc) - len(km), len(kc)))
    print("  missing:", "".join(km))
    if "--names" in sys.argv:
        for c in km:
            print("   U+%04X %s" % (ord(c), unicodedata.name(c, "?")))


if __name__ == "__main__":
    main(sys.argv[1])
