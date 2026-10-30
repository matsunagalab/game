#!/usr/bin/env python
"""Generate src/data/structures.js from RDKit and PDB files.

Usage: python -I tools/make_data.py PDB_DIR OUT_JS
Needs rdkit and numpy. PDB_DIR holds 1UAO, 1L2Y, 1VII, 1PIN, 1MSO, 1PGA, 1UBQ.
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem, rdDepictor
from rdkit.Chem.Draw import rdMolDraw2D
from rdkit.Geometry import Point2D

# Side chain only. Backbone is added below so every amino acid is built the same way.
SIDE = {
    "G": "", "A": "C", "P": "", "V": "C(C)C", "L": "CC(C)C", "M": "CCSC",
    "I": "[C@@H](C)CC", "F": "Cc1ccccc1", "Y": "Cc1ccc(O)cc1",
    "W": "Cc1c[nH]c2ccccc12", "S": "CO", "T": "[C@H](O)C", "C": "CS",
    "N": "CC(N)=O", "Q": "CCC(N)=O", "D": "CC(=O)[O-]", "E": "CCC(=O)[O-]",
    "K": "CCCC[NH3+]", "R": "CCCNC(N)=[NH2+]", "H": "Cc1c[nH]cn1",
}
EXPECTED_CIP = {"C": "R"}

PROTEINS = [
    dict(id="chignolin", pdb="1UAO", chains=[("A", None)], seq="GYDPETGTWG"),
    dict(id="trpcage", pdb="1L2Y", chains=[("A", None)], seq="NLYIQWLKDGGPSSGRPPPS"),
    dict(id="villin", pdb="1VII", chains=[("A", None)], seq="MLSDEDFKAVFGMTRSAFANLPLWKQQNLKKEKGLF"),
    dict(id="ww", pdb="1PIN", chains=[("A", (6, 39))], seq="KLPPGWEKRMSRSSGRVYYFNHITNASQWERPSG"),
    dict(id="insulin", pdb="1MSO", chains=[("B", None), ("A", None)],
         seq="FVNQHLCGSHLVEALYLVCGERGFFYTPKT" + "GIVEQCCTSICSLYQLENYCN"),
    dict(id="gb1", pdb="1PGA", chains=[("A", None)], seq="MTYKLILNGKTLKGETTTEAVDAATAEKVFKQYANDNGVDGEWTYDDATKTFTVTE"),
    dict(id="ubiquitin", pdb="1UBQ", chains=[("A", (1, 76))],
         seq="MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG"),
]
THREE = {"ALA": "A", "ARG": "R", "ASN": "N", "ASP": "D", "CYS": "C", "GLN": "Q", "GLU": "E", "GLY": "G",
         "HIS": "H", "ILE": "I", "LEU": "L", "LYS": "K", "MET": "M", "PHE": "F", "PRO": "P", "SER": "S",
         "THR": "T", "TRP": "W", "TYR": "Y", "VAL": "V"}


def make_mol(code):
    """Zwitterion at pH 7. Atom order always starts N, CA, C, O, OXT, then side chain."""
    if code == "P":
        smi = "[NH2+]1[C@H](C(=O)[O-])CCC1"
    elif code == "G":
        smi = "[NH3+]CC(=O)[O-]"
    else:
        smi = f"[NH3+][C@H](C(=O)[O-]){SIDE[code]}"
    mol = Chem.MolFromSmiles(smi)
    assert mol is not None, code
    return mol


def check_chirality(code, mol):
    if code == "G":
        return
    centers = dict(Chem.FindMolChiralCenters(mol, includeUnassigned=True, useLegacyImplementation=False))
    assert centers[1] == EXPECTED_CIP.get(code, "S"), (code, centers)
    if code == "I":
        assert sorted(centers.values()) == ["S", "S"], centers
    if code == "T":
        assert sorted(centers.values()) == ["R", "S"], centers


def extended_conformer(mol, code):
    """Pick a low-energy conformer whose side chain reaches far from CA."""
    hmol = Chem.AddHs(mol)
    ids = AllChem.EmbedMultipleConfs(hmol, 60, randomSeed=7)
    res = AllChem.MMFFOptimizeMoleculeConfs(hmol, maxIters=2000)
    energies = np.array([e for _, e in res])
    heavy = [a.GetIdx() for a in hmol.GetAtoms() if a.GetAtomicNum() > 1]
    best, best_score = None, -1e9
    for cid, e in zip(ids, energies):
        xyz = hmol.GetConformer(cid).GetPositions()
        reach = np.linalg.norm(xyz[heavy[5:]] - xyz[1], axis=1).max() if len(heavy) > 5 else 0
        score = reach - 0.12 * (e - energies.min())
        if score > best_score:
            best, best_score = cid, score
    xyz = hmol.GetConformer(best).GetPositions()[heavy]
    return orient(xyz)


def orient(xyz):
    """CA at origin, N toward -x, C toward +x, side chain up +y."""
    xyz = xyz - xyz[1]
    n, c = xyz[0], xyz[2]
    x = c - n
    x /= np.linalg.norm(x)
    if len(xyz) > 5:
        cb = xyz[5]
    else:
        # Glycine has no CB. Point the same way, away from N and C, so it faces the viewer too.
        cb = -(n / np.linalg.norm(n) + c / np.linalg.norm(c))
    y = cb - cb.dot(x) * x
    y /= np.linalg.norm(y)
    z = np.cross(x, y)
    return xyz @ np.array([x, y, z]).T


def face_viewer(xyz, side):
    """Spin about the vertical axis so the flat face of the side chain looks at +z."""
    pts = xyz[side]
    if len(pts) < 3:
        return xyz
    normal = np.linalg.svd(pts - pts.mean(axis=0))[2][2]
    a = np.arctan2(normal[0], normal[2])
    c, s = np.cos(a), np.sin(a)
    return xyz @ np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def side_mask(mol, code):
    """Atoms that belong to the side chain. Proline's ring counts as side chain."""
    return [a.GetIdx() >= 5 for a in mol.GetAtoms()]


def depict(code, mol):
    """Skeletal formula with the backbone always in the same place and R pointing down."""
    mol = Chem.Mol(mol)
    if code == "G":
        rw = Chem.RWMol(mol)
        h = rw.AddAtom(Chem.Atom(1))
        rw.AddBond(1, h, Chem.BondType.SINGLE)
        rw.GetAtomWithIdx(1).SetNumExplicitHs(0)
        rw.GetAtomWithIdx(1).SetNoImplicit(True)
        mol = rw.GetMol()
        Chem.SanitizeMol(mol)
    coord = {
        0: Point2D(-1.3, 0.75), 1: Point2D(0, 0), 2: Point2D(1.3, 0.75),
        3: Point2D(1.3, 2.25), 4: Point2D(2.6, 0),
    }
    if mol.GetNumAtoms() > 5:
        coord[5] = Point2D(0, -1.5)
    rdDepictor.SetPreferCoordGen(False)
    rdDepictor.Compute2DCoords(mol, coordMap=coord)
    Chem.Kekulize(mol, clearAromaticFlags=True)
    conf = mol.GetConformer()
    side = {a.GetIdx() for a in mol.GetAtoms() if a.GetIdx() >= 5}
    pts = np.array([[conf.GetAtomPosition(i).x, conf.GetAtomPosition(i).y] for i in range(mol.GetNumAtoms())])
    w, h = np.ptp(pts[:, 0]), np.ptp(pts[:, 1])
    px = 44
    W, H = int((w + 3.0) * px), int((h + 2.2) * px)
    d = rdMolDraw2D.MolDraw2DSVG(W, H)
    o = d.drawOptions()
    o.fixedBondLength = px
    o.useBWAtomPalette()
    o.setBackgroundColour((0, 0, 0, 0))
    o.clearBackground = False
    o.bondLineWidth = 2
    o.minFontSize = 15
    o.maxFontSize = 15
    o.padding = 0.08
    d.DrawMolecule(mol)
    d.FinishDrawing()
    svg = d.GetDrawingText()
    return theme_svg(svg, side, W, H)


def theme_svg(svg, side, W, H):
    """Reduce RDKit's SVG to bare paths that take their colour from CSS."""
    out = []
    for m in re.finditer(r"<path class='([^']*)' d='([^']*)'([^>]*)/>", svg):
        cls, d, rest = m.groups()
        atoms = [int(x) for x in re.findall(r"atom-(\d+)", cls)]
        is_side = any(a in side for a in atoms)
        is_bond = "bond-" in cls
        d = re.sub(r"(\d+\.\d)\d+", r"\1", d)
        k = ("s" if is_side else "b") + ("l" if is_bond else "t")
        out.append(f'<path class="{k}" d="{d}"/>')
    assert out
    return f'<svg viewBox="0 0 {W} {H}" width="{W}" height="{H}" aria-hidden="true">{"".join(out)}</svg>'


def amino_acid(code):
    mol = make_mol(code)
    check_chirality(code, mol)
    xyz = extended_conformer(mol, code)
    mask = side_mask(mol, code)
    xyz = face_viewer(xyz, np.array(mask))
    atoms = [[a.GetSymbol(), *[round(float(v), 2) for v in xyz[a.GetIdx()]], int(mask[a.GetIdx()])] for a in mol.GetAtoms()]
    bonds = []
    for b in mol.GetBonds():
        order = 2 if b.GetBondType() == Chem.BondType.DOUBLE else 1.5 if b.GetIsAromatic() else 1
        bonds.append([b.GetBeginAtomIdx(), b.GetEndAtomIdx(), order])
    charges = [[a.GetIdx(), a.GetFormalCharge()] for a in mol.GetAtoms() if a.GetFormalCharge() and a.GetIdx() >= 5]
    return dict(atoms=atoms, bonds=bonds, charges=charges, svg=depict(code, mol))


def read_pdb(path):
    atoms = []
    for line in Path(path).read_text().splitlines():
        rec = line[:6].strip()
        if rec == "ENDMDL":
            break  # first NMR model only
        if rec != "ATOM":
            continue
        if line[16] not in " A":
            continue
        el = (line[76:78].strip() or line[12:16].strip()[0]).capitalize()
        if el in ("H", "D"):
            continue
        atoms.append(dict(name=line[12:16].strip(), res=line[17:20], chain=line[21], num=int(line[22:26]),
                          xyz=np.array([float(line[30:38]), float(line[38:46]), float(line[46:54])]), el=el))
    return atoms


def secondary_structure(path):
    """Read HELIX and SHEET records: {(chain, resnum): 1 helix, 2 strand}."""
    ss = {}
    for line in Path(path).read_text().splitlines():
        if line.startswith("HELIX "):
            chain, a, b, kind = line[19], int(line[21:25]), int(line[33:37]), 1
        elif line.startswith("SHEET "):
            chain, a, b, kind = line[21], int(line[22:26]), int(line[33:37]), 2
        else:
            continue
        for k in range(a, b + 1):
            ss[(chain, k)] = kind
    return ss


def protein(p, pdb_dir):
    all_atoms = read_pdb(Path(pdb_dir) / f"{p['pdb']}.pdb")
    records = secondary_structure(Path(pdb_dir) / f"{p['pdb']}.pdb")
    residues = []
    ss = []
    breaks = []
    for chain, span in p["chains"]:
        keys = []
        for a in all_atoms:
            if a["chain"] != chain or a["res"] not in THREE:
                continue
            if span and not span[0] <= a["num"] <= span[1]:
                continue
            k = a["num"]
            if k not in keys:
                keys.append(k)
        for k in keys:
            residues.append([a for a in all_atoms if a["chain"] == chain and a["num"] == k])
            ss.append(records.get((chain, k), 0))
        breaks.append(len(residues))
    breaks = breaks[:-1]
    seq = "".join(THREE[r[0]["res"]] for r in residues)
    assert seq == p["seq"], (p["id"], seq, p["seq"])
    ca = np.array([next(a["xyz"] for a in r if a["name"] == "CA") for r in residues])
    center = ca.mean(axis=0)
    u, s, vt = np.linalg.svd(ca - center)
    rot = vt if np.linalg.det(vt) > 0 else vt * np.array([[1], [1], [-1]])
    place = lambda v: rot @ (v - center)
    out_res = []
    sulfurs = []
    for i, r in enumerate(residues):
        bb = {"N", "C", "O", "OXT"}
        sc = [a for a in r if a["name"] not in bb and a["name"] != "CA"]
        ordered = [next(a for a in r if a["name"] == "CA")] + sc
        bonds = []
        for x in range(len(ordered)):
            for y in range(x + 1, len(ordered)):
                if np.linalg.norm(ordered[x]["xyz"] - ordered[y]["xyz"]) < 1.95:
                    bonds.append([x, y])
        for j, a in enumerate(ordered):
            if a["name"] == "SG":
                sulfurs.append((i, j, a["xyz"]))
        out_res.append(dict(
            ca=[round(float(v), 2) for v in place(ordered[0]["xyz"])],
            atoms=[[a["el"], *[round(float(v), 2) for v in place(a["xyz"])]] for a in ordered[1:]],
            bonds=bonds,
        ))
    ssbonds = []
    for x in range(len(sulfurs)):
        for y in range(x + 1, len(sulfurs)):
            if np.linalg.norm(sulfurs[x][2] - sulfurs[y][2]) < 2.4:
                ssbonds.append([sulfurs[x][0], sulfurs[x][1], sulfurs[y][0], sulfurs[y][1]])
    return dict(id=p["id"], pdb=p["pdb"], seq=seq, ss="".join(map(str, ss)), breaks=breaks, ssbonds=ssbonds, residues=out_res)


def main():
    pdb_dir, out = sys.argv[1], sys.argv[2]
    data = dict(
        aminoAcids={c: amino_acid(c) for c in SIDE},
        proteins={p["id"]: protein(p, pdb_dir) for p in PROTEINS},
    )
    js = "// Generated by tools/make_data.py. Do not edit by hand.\nexport const STRUCTURES = " + json.dumps(data, separators=(",", ":")) + ";\n"
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(js)
    print("bytes", len(js))
    for p in data["proteins"].values():
        print(p["id"], p["pdb"], len(p["seq"]), "ss", p["ss"], "breaks", p["breaks"], "disulfides", len(p["ssbonds"]))
    seen = set("".join(p["seq"] for p in data["proteins"].values()))
    assert seen == set(SIDE) and len(seen) == 20, seen ^ set(SIDE)


if __name__ == "__main__":
    main()
