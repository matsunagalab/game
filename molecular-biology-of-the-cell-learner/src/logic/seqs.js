// Real human sequences. CCND1 from Ensembl (ENST00000227507, GRCh38), proteins from UniProt.
// `signal` is the UniProt end of the signal peptide. For TGF-α (P01135) residue 23 is predicted (ECO:0000255), not measured.
export const CCND1_EXON1_CDS = "ATGGAACACCAGCTCCTGTGCTGCGAAGTGGAAACCATCCGCCGCGCGTACCCCGATGCCAACCTCCTCAACGACCGGGTGCTGCGGGCCATGCTGAAGGCGGAGGAGACCTGCGCGCCCTCGGTGTCCTACTTCAAATGTGTGCAGAAGGAGGTCCTGCCGTCCATGCGGAAGATCGTCGCCACCTGGATGCTGGAG";
export const CCND1_DONOR = { exon: "GCCACCTGGATGCTGGAG", intron: "GTGCGGGGCTTCGGGCGG" };
export const CCND1_ACCEPTOR = { intron: "CGGGCCCCGTGCCTCCGTAG", exon: "GTCTGCGAGGAACAGAAG" };
export const INTRON_LENGTH = 1519;
export const PROTEINS = {
  TGFA: { uniprot: "P01135", length: 160, signal: 23, tm: [99, 124], seq: "MVPSAGQLALFALGIVLAACQALENSTSPLSADPPVAAAVVSHFNDCPDSHTQFCFHGTCRFLVQEDKPACVCHSGYVGARCEHADLLAVVAASQKKQAITALVVVSIVALAVLIITCVLIHCCQVRKHCEWCRALICRHEKPSALLKGRTACCHSETVV" },
  INS: { uniprot: "P01308", length: 110, signal: 24, tm: null, seq: "MALWMRLLPLLALLALWGPDPAAAFVNQHLCGSHLVEALYLVCG" },
  ALB: { uniprot: "P02768", length: 609, signal: 18, tm: null, seq: "MKWVTFISLLFLFSSAYSRGVFRRDAHKSEVAHRFKDLGEENFK" },
  EGFR: { uniprot: "P00533", length: 1210, signal: 24, tm: [646, 668], seq: "MRPSGTAGAALLALLAALCPASRALEEKKVCQGTSNKLTQLGTF" },
  LDLR: { uniprot: "P01130", length: 860, signal: 21, tm: [789, 810], seq: "MGPWGWKLRWTVALLLAAAGTAVGDRCERNEFQCQDGKCISYKW" },
  COL1A1: { uniprot: "P02452", length: 1464, signal: 22, tm: null, seq: "MFSFVDLRLLLLLAATALLTHGQEEGQVEGQDEDIPPITCVQNG" },
  ACTB: { uniprot: "P60709", length: 375, signal: 0, tm: null, seq: "MDDDIAALVVDNGSGMCKAGFAGDDAPRAVFPSIVGRPRHQGVM" },
  GAPDH: { uniprot: "P04406", length: 335, signal: 0, tm: null, seq: "MGKVKVGVNGFGRIGRLVTRAAFNSGKVDIVAINDPFIDLNYMV" },
  CCND1: { uniprot: "P24385", length: 295, signal: 0, tm: null, seq: "MEHQLLCCEVETIRRAYPDANLLNDRVLRAMLKAEETCAPSVSY" },
  HBB: { uniprot: "P68871", length: 147, signal: 0, tm: null, seq: "MVHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFE" },
  YWHAE: { uniprot: "P62258", length: 255, signal: 0, tm: null, seq: "MDDREDLVYQAKLAEQAERYDEMVESMKKVAGMDVELTVEERNL" },
};

// U1 snRNA, read 3'→5' so that it lines up with the 5' splice site written 5'→3'.
export const U1 = 'GUCCAUUCA';
const W = { G: 'C', U: 'A', C: 'G', A: 'U' };
export const u1Pairs = (site) => [...U1].map((b, i) => site[i] === W[b]);
export const u1Scores = (rna) => Array.from({ length: rna.length - 8 }, (_, i) => u1Pairs(rna.slice(i, i + 9)).filter(Boolean).length);
