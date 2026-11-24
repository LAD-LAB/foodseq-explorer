# FoodSeq Reference Databases — release 2026.11

Reference sequence databases for FoodSeq dietary DNA metabarcoding: the
chloroplast *trnL*(UAA) intron for plants and the mitochondrial 12S rRNA
V5 region for vertebrates. Built from NCBI RefSeq and GenBank,
restricted to a curated list of 3,806 human food species, and formatted
for DADA2 and QIIME 2.

-   **Version:** 2026.11 (supersedes 2026.10 and 2026.08 — see
    "Corrections to 2026.10 and 2026.08" below before reusing results
    from those versions)
-   **Pipeline source:** <https://github.com/LAD-LAB/food-dbs>, commit
    `[commit hash — fill in after the release-2026.11 branch is merged]`
-   **Contact:** Sarah Brown, Sarah.A.Brown\@duke.edu
-   **License:** CC BY 4.0
-   **Cite as:** `[DOI of this version — assigned by Zenodo on deposit]`.
    Previous versions: 2026.10 is 10.5281/zenodo.23772049 and 2026.08 is
    10.5281/zenodo.22756737.

------------------------------------------------------------------------

## Corrections to 2026.10 and 2026.08

### Corrections to 2026.10

Releases 2026.08 and 2026.10 both contain eight mislabelled trnL
records: the sequence is not that of the species on the label. They are
removed from trnL g/h in this release, and the five that are also in
trnL c/d are removed from there too. The evidence for each is in
`inputs/omit-accessions.csv`.

**How they were found.** A wastewater dataset re-assigned with 2026.10
lost its most abundant lettuce ASV (50 bp, over 160,000 reads) to class
level. The trnL g/h record `PP081760.1`, labelled *Lonicera japonica*
(Caprifoliaceae), carries a lettuce-type sequence, so reads of lettuce
matched records from two families and `assignTaxonomy()` could assign
them no lower than class. Comparing the amplicon between the primer
sites across every g/h record then showed seven groups of records from
different families with identical sequence. Seven of the eight records
below are in those groups; the eighth (`PP081791.1`) comes from the same
submission as two of them. Each record was compared with the other
records of its species, genus and family and BLASTed against NCBI.
**No record was checked against a physical voucher.**

| Accession | Labelled | The sequence is | First in | In trnL c/d |
|----|----|----|----|----|
| `PP081760.1` | *Lonicera japonica* | lettuce-type (Asteraceae): identical to *Lactuca sativa* `NC_007578.1` | 2026.08 | no |
| `PP081769.1` | *Coix lacryma-jobi* | ginger-family type: identical to *Zingiber mioga* `NC_057615.1` | 2026.08 | no |
| `PP081791.1` | *Aloe vera* | *Rorippa cantoniensis* (mustard family): 100% match in BLAST | 2026.08 | no |
| `GU134556.1` | *Elaeis guineensis* | Asteraceae type: identical to 13 Asteraceae records | 2025 reference | yes |
| `KX667944.1` | *Sambucus nigra* | *Lathyrus sylvestris* (Fabaceae) type | 2025 reference | yes |
| `MK797493.1` | *Peperomia pellucida* | Moraceae type: identical to dozens of *Maclura* and *Ficus* records | 2025 reference | yes |
| `DQ221163.1` | *Sesamum indicum* | Apocynaceae type: identical to dozens of Apocynaceae records | 2025 reference | yes |
| `NC_057307.1` | *Eugenia brasiliensis* | a Malpighiaceae chloroplast genome (below) | 2025 reference | yes |

**The RefSeq *Eugenia brasiliensis* record.** `NC_057307.1` is a
RefSeq complete chloroplast genome, but it is not a *Eugenia* genome.
Its rbcL gene is 99–100% identical to Malpighiaceae genes in BLAST, with
no Myrtaceae among the top 30 hits, and its matK is 99% identical to
*Aspidopterys concava* (Malpighiaceae). An independent *E. brasiliensis*
plastome, `MN095407.1` (Rodrigues et al. 2020), is only 94% identical to
it in rbcL and 84% in matK, while 11 other *E. brasiliensis* records
from at least four separate submissions (voucher series ICN 167416 and
Lucas 126, isolate VCS35082, and others) match `MN095407.1` at
99.2–100%. The RefSeq record is marked provisional, is a copy of
GenBank `MT900596.1`, and neither carries a voucher, isolate or
publication. This release uses `MN095407.1` for *E. brasiliensis* in
trnL g/h. Its own GenBank record also has no voucher; its support is the
paper and the agreement with the independent records. trnL c/d is built
by alignment rather than primer matching, so *E. brasiliensis* is not in
trnL c/d in this release.

**Effect on the databases.** trnL g/h goes from 2,116 to 2,109
sequences and from 1,272 to 1,271 taxa (*Peperomia pellucida* has no
other usable g/h record and is lost). trnL c/d goes from 4,520 to 4,515
sequences and from 1,173 to 1,172 taxa (*Eugenia brasiliensis* is lost).
12SV5 is unchanged. No other species is lost.

**If you used 2026.08 or 2026.10.** In trnL g/h, ASVs whose sequence
matched one of these records and a record from another family were
assigned no lower than a higher rank (class, in the lettuce case).
Re-assigning trnL data against this release shows which ASVs change.

**Not yet reviewed.** The same comparison on 12SV5 finds six groups of
records from different families with an identical V5 amplicon (for
example *Epinephelus marginatus* `AM931025.1` with five Sciaenidae, and
*Nesiarchus nasutus* `NC_022490.1` with four flatfish; both were also
flagged by an earlier label audit). They have not been reviewed and are
unchanged in this release.

### Corrections to 2026.08

Release 2026.08 had four problems. All were fixed in 2026.10 and stay
fixed here.

1.  **Reverse-complemented 12SV5 records.** The 2026.08 12SV5 database
    contains 52 records stored in the reverse orientation (reverse
    primer first). They were added in the September 2026 recovery by a
    helper notebook that did not apply the pipeline's orientation step.
    `dada2::assignTaxonomy()` matches the forward strand only by
    default, so reads from the species in those records could not be
    assigned to them. If you assigned 12SV5 data against 2026.08, those
    species may be missing from your results (typically assigned to a
    higher rank or to nothing). All records in this release are
    forward-oriented, and the QC gate now fails on any that are not. The
    affected records are listed in the GitHub repository at
    `data/outputs/coverage-recheck/ORIENTATION_fix_Oct2026.csv`. The
    2026.08 trnL and trnL c/d databases were not affected.
2.  **Primers are included, not trimmed.** The 2026.08 README said the
    trnL g/h and 12SV5 sequences exclude the priming sites. They include
    them (see "Sequence conventions" below). The sequences themselves
    are unchanged in this respect.
3.  **Two mislabelled trnL c/d records.** The 2026.08 trnL c/d database
    contains JX390727.1, labelled *Murraya koenigii*, which is a peanut
    (*Arachis hypogaea*) sequence (99–100% identical to peanut records,
    74.5% to other *Murraya*), and GU595140.1, labelled *Secale cereale*,
    which is a rice (*Oryza*) sequence (98.7–99.8% identical to rice
    records, 92.2% to other *Secale*). Both are removed in this release;
    each species keeps its other records. The same two accessions were
    already excluded from trnL g/h.
4.  **Line endings.** The 2026.08 trnL g/h and 12SV5 FASTA files use
    Windows (CRLF) line endings, because they were extended on a Windows
    machine; trnL c/d used LF. Strict FASTA parsers can read the stray
    carriage return as part of the sequence. Every file in this release
    uses LF, and the QC gate now fails on carriage returns.

------------------------------------------------------------------------

## Contents of this archive

```
.
├── README.md                              # this file
├── SHA256SUMS.txt                         # checksums of every file below
├── dada2-compatible/
│   ├── trnL/
│   │   ├── trnLGH_v2026.11.fasta           # accession headers
│   │   └── trnLGH_taxonomy_v2026.11.fasta  # taxonomy headers (for assignTaxonomy)
│   ├── 12Sv5/
│   │   ├── 12Sv5_v2026.11.fasta
│   │   └── 12Sv5_taxonomy_v2026.11.fasta
│   └── trnLCD/
│       ├── trnLCD_v2026.11.fasta
│       └── trnLCD_taxonomy_v2026.11.fasta
├── qiime2-compatible/
│   ├── trnL/
│   │   ├── trnL-sequences_v2026.11.fasta   # FeatureData[Sequence]
│   │   └── trnL-taxonomy_v2026.11.tsv      # FeatureData[Taxonomy]
│   ├── 12Sv5/
│   │   ├── 12Sv5-sequences_v2026.11.fasta
│   │   └── 12Sv5-taxonomy_v2026.11.tsv
│   └── trnLCD/
│       ├── trnLCD-sequences_v2026.11.fasta
│       └── trnLCD-taxonomy_v2026.11.tsv
└── inputs/
    ├── human-foods.csv                    # the 3,806-entry target list
    ├── controls.csv                       # control and host-taxon records added to every build
    └── omit-accessions.csv                # mislabelled records dropped from the build, with the evidence
```

## Summary of the databases

| Database | Marker | Primers (5'→3') | Amplicon length (min / median / max, bp) | Sequences | Unique taxa |
|----|----|----|----|----|----|
| trnL g/h | *trnL*(UAA) P6 loop, plants | trnL-g `GGGCAATCCTGAGCCAA` / trnL-h `CCATTGAGTCTCTGCACCTATC` | 50 / 90 / 405 | 2,109 | 1,271 |
| 12SV5 | 12S rRNA V5, vertebrates | V5F `TAGAACAGGCTCCTCTAG` / V5R `TTAGATACCCCACTATGC` | 71 / 135 / 180 | 2,684 | 1,984 |
| trnL c/d | full *trnL*(UAA) intron, plants | trnL-c `CGAAATCGGTAGACGCTACG` / trnL-d `GGGGATAGAGGGACTTGAAC` | 150 / 516 / 749 | 4,515 | 1,172 |

"Unique taxa" counts distinct species-level names in the taxonomy field,
including the control and host records described below. Sequence counts
and unique-taxa counts are identical between the DADA2 and QIIME 2
versions of each database — the files contain the same records in two
formats. Compared with 2026.10, trnL g/h differs by eight omitted records
and one added record, trnL c/d by five omitted records (all described
under "Corrections to 2026.10"), and 12SV5 is unchanged.

### Sequence conventions

-   **trnL g/h and 12SV5** — each sequence is the in-silico PCR product
    **including both primer sequences**, **forward-oriented** (forward
    primer at the 5′ end, the reverse complement of the reverse primer
    at the 3′ end). The exceptions are the control and host records
    from `controls.csv` (for example the 89 *Homo sapiens* records) and
    a few records from GenBank deposits that begin inside a priming
    site (18 trnL records and 4 12SV5 records). Denoised reads usually
    have primers removed, which does not affect `assignTaxonomy()`
    (k-mer based). If you do strict full-length exact matching, trim the
    primer lengths from the references first.
-   **trnL c/d** — **primer-trimmed** and oriented c → d.

## File formats

### DADA2-compatible (`dada2-compatible/`)

Two FASTA files per marker with identical sequences in identical order:

-   `*_taxonomy_*.fasta` — headers are a semicolon-delimited lineage
    with **10 ranks**, for use with `dada2::assignTaxonomy()`:

    ```
    >Eukaryota;Chordata;Actinopteri;Cypriniformes;Leuciscidae;Abramis;Abramis brama;Abramis brama orientalis;NA;NA
    ```

    Rank order: superkingdom; phylum; class; order; family; genus;
    species; subspecies; variety; forma. Ranks with no value are written
    as the literal string `NA`. Every record has the first seven ranks
    filled.

-   `*_v2026.11.fasta` (no `_taxonomy`) — headers are the NCBI accession
    followed by the species name, for traceability and exact-match
    lookups:

    ```
    >NC_079822.1 (Citrus unshiu x Citrus sinensis) x Citrus reticulata
    ```

Sequences are wrapped at 80 characters, and all files use LF line endings.

### QIIME 2-compatible (`qiime2-compatible/`)

-   `*-sequences_*.fasta` — bare accession headers (`>NC_079822.1`), one
    record per sequence. Import as `FeatureData[Sequence]`.
-   `*-taxonomy_*.tsv` — tab-separated, header row
    `Feature ID<TAB>Taxon`, one row per sequence, with the same 10-rank
    semicolon lineage as the DADA2 taxonomy headers. Import as
    `FeatureData[Taxonomy]` (`HeaderlessTSVTaxonomyFormat` is *not*
    needed — the file has a header).

### Inputs (`inputs/`)

-   `human-foods.csv` — the target species list. Columns: `needs_QC`,
    `scientific_name`, `common_name`, `alternative_names`, `category`
    (`plant`, `animal`, `fungus`, `bacteria`), `source`, `region`,
    `use`, `notes`, `build_name`, and a trailing empty column. Plants
    are the trnL targets; animals are the 12SV5 targets. `build_name`
    (new in 2026.10) holds the name the reference uses when NCBI files a
    species' sequences under a different name from the one on the list —
    a taxonomic rename, a spelling variant, or an infraspecific name NCBI
    does not recognise. 234 entries have one (165 plants, 69 animals).
-   `controls.csv` — non-food records inserted into every build.
    Columns: `marker`, `accession`, `label`, `sequence`, `lineage`,
    `notes`.
-   `omit-accessions.csv` — accessions known to be mislabelled, which the
    pipeline, the Extend notebook and the QC gate drop or refuse. Columns:
    `accession`, `markers` (`trnLGH`, `trnLCD`, or both), `species_as_labelled`,
    `sequence_is_actually`, `evidence`, `date_checked`.

## Target species list and coverage

`human-foods.csv` lists 3,806 food taxa compiled from more than 30
literature and database sources (FDA Seafood List, GRIN Taxonomy for
Plants, FAO Cultured Aquatic Species Fact Sheets, NOAA Fisheries, Milla
2020 *Crop Origins*, Lim *Edible Medicinal and Non-Medicinal Plants*,
van Wyk *Food Plants of the World*, and others; the `source` column
records the origin of each entry).

| Category                     | Entries   |
|------------------------------|-----------|
| Plants (species-level)       | 1,573     |
| Plants (genus/family-level)  | 7         |
| Animals (species-level)      | 2,121     |
| Animals (genus/family-level) | 70        |
| Fungi                        | 33        |
| Bacteria                     | 2         |
| **Total**                    | **3,806** |

Coverage of the species-level targets by this release:

| Marker   | Exact name on the list     | Including `build_name` synonyms |
|----------|----------------------------|---------------------------------|
| trnL g/h | 1,136 / 1,573 plants (72%) | 1,301 / 1,573 (83%)             |
| 12SV5    | 1,238 / 2,121 animals (58%) | 1,307 / 2,121 (62%)            |

"Exact name" counts a food species only when the reference holds a
species of that name. The synonym column also counts species the
reference holds under another name recorded in `build_name`.

Coverage history by exact name, recomputed against the current species
list so the rows are comparable:

| Build        | trnL sequences | trnL coverage | 12SV5 sequences | 12SV5 coverage |
|--------------|----------------|---------------|-----------------|----------------|
| Oct 2022     | 1,402          | 46%           | 57              | —              |
| 2025         | 1,991          | 67%           | 2,991           | 42%            |
| May 2026     | 1,991          | 67%           | 3,390           | 42%            |
| 2026.08      | 2,027          | 69%           | 2,384           | 46%            |
| 2026.10      | 2,116          | 72%           | 2,684           | 58%            |
| **2026.11**  | **2,109**      | **72%**       | **2,684**       | **58%**        |

The 12SV5 sequence count is lower than in May 2026 even though coverage
is higher: the Aug 2026 build added a deduplication step that collapses
redundant and cross-genus-conflicting records, and removed 21 records
carrying off-target (bacterial/viral) labels.

Most remaining gaps are species with no public sequence spanning the
primer sites. The biggest single source of missing animals is the FDA
Seafood List (655 of the 814 uncovered animals); 42 of the uncovered
animals are edible insects, which the 12SV5 vertebrate marker does not
target. For plants, 272 species remain uncovered; 178 of them have
neither a marker record nor a complete chloroplast genome at NCBI. See
"Known limitations" for the gaps that *are* pipeline-attributable.

## Controls and host taxa

Every build includes a small set of deliberately non-food records from
`controls.csv`. They are needed for correct behavior on real dietary
samples and are excluded from the coverage figures above.

| Marker | Record | Purpose |
|----|----|----|
| trnL, 12SV5 | `synthetic trnL ASV`, `synthetic 12S ASV` | The synthetic spike-in positive control used in the FoodSeq wet-lab protocol. Present so control reads are recognized rather than mis-assigned to the nearest real taxon. |
| 12SV5 | *Homo sapiens* (89 records) | Host DNA. Human reads make up roughly half of all 12SV5 reads in stool samples; without human in the reference they are assigned to the nearest vertebrate, which includes food clades (Artiodactyla, Bovidae, Cervidae). The 89 records cover mitochondrial haplogroup variants and nuclear mitochondrial pseudogene (NUMT) copies observed in real data. |
| 12SV5 | *Rhacodactylus leachianus* | Real-species positive control (gecko) used in the lab protocol. |
| trnL | *Nicotiana tabacum* | Tobacco. Reaches samples through exposure or contamination rather than as food, so it is intentionally absent from `human-foods.csv`; included so those reads are assigned correctly instead of dropped or mis-assigned. |

Since these are real species, they appear in assignment output like any
other taxon. They can be filtered during analysis if they are not of
interest.

## How the databases were built

The full pipeline is in `foodseq_reference_pipeline.Rmd` in the GitHub
repository. In brief, for each marker:

1.  **Sequence acquisition** from two sources, merged:
    -   *RefSeq*: complete plastid (trnL) or mitochondrial (12SV5)
        genomes from the NCBI RefSeq FTP release, one per species, in
        silico amplified with the primer pair and then filtered to the
        food species list.
    -   *GenBank*: per-species queries to the NCBI nucleotide database
        via the E-utilities (`rentrez`), scoped to the marker name and
        the food species list, restricted to records ≤50 kb.
2.  **In silico PCR**: amplicons extracted with `find_primer_pair()`,
    allowing up to \~20% mismatch per primer; records lacking either
    priming site are dropped.
3.  **Quality filtering**: unverified records and sequences containing
    degenerate (non-ACGT) bases removed.
4.  **Taxonomy**: accessions mapped to full NCBI lineages with
    `taxonomizr` (local mirror of NCBI Taxonomy), with a live
    E-utilities fallback for accessions newer than the local mirror.
5.  **Off-target filtering**: a phylum allowlist removes records whose
    lineage is not a land plant (trnL) or vertebrate (12SV5) regardless
    of how they matched.
6.  **Manual curation** (trnL only): records listed as omissions in
    `Manual renaming.csv` are dropped, and a few *Brassica oleracea*
    variety renamings are applied. Additions listed in the same file
    (mostly whole-genome records beyond the 50 kb query cap) are merged
    in at step 1.
7.  **Orientation standardization** and **deduplication**: amplicons
    stored forward-primer-first; identical sequences from the same taxon
    collapsed to one record, RefSeq accessions preferred.
8.  **Controls** appended from `controls.csv`.
9.  **QC gate** (`qc_reference_build.R`): control presence, rank
    completeness, clade consistency, accession integrity, orientation,
    line endings, record-count tolerance against the previous release, and a coverage
    check against the 2025 reference (every food species it held must be
    present, or documented as absent). A build must pass with zero
    failures to be released.

The **trnL c/d** database reuses the trnL inputs but extracts the full
intron by a three-tier method: primer matching on complete plastomes,
primer matching on GenBank records, and an alignment-based rescue
against family-matched plastome introns for the majority of GenBank
*trnL* deposits that are already primer-trimmed and contain neither the
c nor the d site. This is why trnL c/d has more sequences than trnL g/h
despite covering slightly fewer taxa.

### Additions after the cluster build

Release 2026.11 is the August 2026 cluster build plus additions made in
September and October 2026 with `code/Extend reference.Rmd`, followed by
the omissions described under "Corrections to 2026.10". Extend queries
NCBI directly, applies
the same QC (in silico PCR, unverified and degenerate-base filters,
phylum allowlist, deduplication) and, since 2026.10, the same
forward-orientation step and a check that each amplicon's length falls
within the range the reference already holds. It runs in two modes:

-   *marker records* — the GenBank query used by the pipeline;
-   *plastome* (trnL only; new in 2026.10) — complete chloroplast
    genomes found by organism and title, with the amplicon cut out by
    primer matching. This reaches plants whose only trnL sequence is
    inside a complete plastome, which the ≤50 kb length cap and the
    marker-name search both miss.

Extend also skips any accession listed in `inputs/omit-accessions.csv`,
so a query cannot bring a known mislabel back (a plastome query for
*Eugenia brasiliensis* returns `NC_057307.1`).

## Changes in this release

Relative to 2026.10:

-   **Corrections**: see "Corrections to 2026.10" above. Eight
    mislabelled records are omitted from trnL g/h and five of them from
    trnL c/d; *Eugenia brasiliensis* is represented in g/h by `MN095407.1`.
-   **Coverage**: trnL g/h 2,116 → 2,109 sequences and 1,272 → 1,271
    taxa (1,137 → 1,136 of 1,573 plants by exact name, 1,302 → 1,301
    including synonyms; both still 72% and 83%). trnL c/d 4,520 → 4,515
    sequences and 1,173 → 1,172 taxa. 12SV5 is unchanged (2,684
    sequences, 1,984 taxa).
-   **New input**: `omit-accessions.csv`, read by the pipeline (steps A7,
    CD7 and B5), the Extend notebook and the QC gate. It replaces the
    hard-coded c/d omission list.
-   **QC gate**: new check 11 fails when a record new since the previous
    build has the same primer-trimmed amplicon as a record from a
    different family, and warns about such groups that already existed.
-   **File names**: all files are named `_v2026.11`; the 12SV5 files are
    unchanged in content.

Relative to 2026.08 (all of this was already in 2026.10):

-   **Corrections**: see "Corrections to 2026.08" above.
-   **Coverage**: trnL 69% → 72% (78% → 83% including synonyms) and
    12SV5 46% → 58% (49% → 62%) of the current food list. 12SV5 grew
    from 2,384 to 2,684 sequences and trnL from 2,027 to 2,116; trnL c/d
    is unchanged.
-   **Restored animals**: 202 food-list animal species that the 2025
    reference held but 2026.08 lacked (cod, pollock and tuna among them)
    were found by comparing against the 2025 reference and re-added; each
    has a valid V5 amplicon at NCBI. The cause of the loss is known for
    two of the first ten (a 500-result fetch cap per batch of five
    species) and not established for the rest. A further 58 animals with
    a valid amplicon (including yak, llama and guanaco) were found by
    checking every uncovered species against NCBI.
-   **Plastome path**: 73 plants whose only trnL sequence was inside a
    complete chloroplast genome were added (83 sequences, 76 taxa).
-   **Name review**: 149 food-list names that NCBI Taxonomy did not
    recognise were reviewed. 15 misspellings were corrected, 31 names
    were mapped to the name the reference uses (`build_name`), and 4
    vertebrates and 5 plants gained sequence directly. Doubtful
    synonymies were left unapplied.
-   **Dropped**: two 437 bp *Pseudophycis breviuscula* amplicons, which
    fall far outside the 12SV5 length range (71–180 bp), and 20 exact
    duplicates exposed once reversed records were corrected.
-   **trnL c/d**: two mislabelled records removed (4,522 → 4,520
    sequences; no species lost).
-   **Line endings**: all files converted to LF (the 2026.08 trnL g/h
    and 12SV5 files were CRLF).
-   **QC gate**: new coverage check against the 2025 reference, and new
    orientation and line-ending checks.

Relative to the 2025 databases (as described for 2026.08):

-   **Host and controls**: *Homo sapiens* (12SV5), *Nicotiana tabacum*
    (trnL), and the synthetic spike-in controls are included in every
    build and enforced by the QC gate. Earlier builds had inherited some
    of these records incidentally and lost them when the pipeline became
    strictly food-list-driven.
-   **Fixes**: 21 12SV5 records that carried bacterial or viral taxonomy
    labels on vertebrate sequences were corrected; a bug that assigned
    bare-genus accessions was fixed; sequences from the same taxon are
    now deduplicated.
-   **New**: trnL c/d database, built and QC-gated within the same
    pipeline for the first time. It supersedes the 2025 compilation
    (2,239 records) with 4,522 records (4,515 in this release, after seven
    mislabelled records were removed).

## Known limitations

-   **Plants with neither a marker record nor a plastome.** 178 food
    plants have no trnL record at NCBI under 50 kb and no complete
    chloroplast genome either, so no amplicon can be built.
-   **Species NCBI holds under no usable name.** 17 plant and 78 animal
    names on the food list are not recognised by NCBI Taxonomy (obsolete
    names, unrecognised varieties, or valid names with no sequences;
    52 of the animals are invertebrates). Ten GBIF-suggested synonymies
    that looked doubtful were not applied (listed in the GitHub
    repository at
    `data/outputs/coverage-recheck/NAMES_resolution_Oct2026.csv`).
-   **12SV5 primer sites.** 366 animals have NCBI records but none with
    both V5 primer sites; three food fish (*Myxine glutinosa*,
    *Parupeneus cyclostomus*, *Upeneus parvus*) have complete mitogenomes
    that lack a V5 site, so no amplicon can be derived. 36 of the 39 fish
    that earlier looked unexplained are now present.
-   **Invertebrates.** 12SV5 targets vertebrates only; edible insects,
    molluscs, and crustaceans on the food list are expected gaps.
-   **5′-truncated trnL records.** 18 of 2,109 trnL g/h records derive
    from GenBank deposits that begin inside the trnL-g priming site and
    are missing 1–2 bases at the 5′ end. Four taxa (*Camellia sinensis*
    var. *assamica*, *Camellia japonica* subsp. *rusticana*, *Dianella
    caerulea*, *Limnocharis flava*) are represented only by such a
    record, which can affect exact-match assignment.
-   **Species dropped between builds.** Because the build is driven by
    the food species list, a small number of subspecies/variety records
    present in the 2025 reference (e.g. *Beta vulgaris* subsp.
    *adanensis*, *Fuchsia* × *standishii*) are not in this one.
    Species-level records for the same plants are retained.
-   **Species lost to the omissions.** *Peperomia pellucida* (trnL g/h) and
    *Eugenia brasiliensis* (trnL c/d) have no remaining usable record in
    those databases. *Peperomia pellucida* is listed in
    `known-absent-species.csv` in the GitHub repository.
-   **Cross-family identical 12SV5 amplicons.** Six groups of 12SV5 records
    from different families have an identical V5 amplicon. They have not
    been reviewed; at least two groups contain records an earlier label
    audit flagged.
-   **Labels are inferred from sequence, not checked against vouchers.**
    The eight omitted records were identified by sequence comparison and
    BLAST. Other mislabelled records may remain wherever they do not share
    an amplicon with a record from another family.
-   **12SV5 assignment is stochastic.** `dada2::assignTaxonomy()` uses
    bootstrap resampling whose random state is not controlled by R's
    `set.seed()`; repeated runs on identical input differ for roughly
    1–2% of ASVs. This is a property of the classifier, not the
    reference, but it affects any comparison across reference versions.

## Using the databases

### DADA2 (R)

``` r
library(dada2)

# trnL — short amplicon; exact matching is recommended
tax_trnL <- assignTaxonomy(seqtab_trnL,
                           "dada2-compatible/trnL/trnLGH_taxonomy_v2026.11.fasta",
                           taxLevels = c("superkingdom","phylum","class","order",
                                         "family","genus","species",
                                         "subspecies","variety","forma"),
                           multithread = TRUE)

# 12SV5
tax_12S  <- assignTaxonomy(seqtab_12S,
                           "dada2-compatible/12Sv5/12Sv5_taxonomy_v2026.11.fasta",
                           taxLevels = c("superkingdom","phylum","class","order",
                                         "family","genus","species",
                                         "subspecies","variety","forma"),
                           multithread = TRUE)
```

`assignTaxonomy()` expects every header to have the same number of
ranks; all headers here have exactly 10, so `taxLevels` must also have
length 10. For exact matching of trnL ASVs against reference sequences,
use the accession FASTA (`trnLGH_v2026.11.fasta`) or
`dada2::assignSpecies()`.

Query sequences should have primers removed and be in the same
orientation as the reference (forward primer at the 5′ end).

### QIIME 2

``` bash
qiime tools import --type 'FeatureData[Sequence]' \
  --input-path qiime2-compatible/12Sv5/12Sv5-sequences_v2026.11.fasta \
  --output-path 12Sv5-ref-seqs.qza

qiime tools import --type 'FeatureData[Taxonomy]' \
  --input-format TSVTaxonomyFormat \
  --input-path qiime2-compatible/12Sv5/12Sv5-taxonomy_v2026.11.tsv \
  --output-path 12Sv5-ref-taxonomy.qza

# then e.g.
qiime feature-classifier classify-consensus-vsearch \
  --i-query rep-seqs.qza \
  --i-reference-reads 12Sv5-ref-seqs.qza \
  --i-reference-taxonomy 12Sv5-ref-taxonomy.qza \
  --o-classification taxonomy.qza --o-search-results hits.qza
```

Or train a naive Bayes classifier with
`qiime feature-classifier fit-classifier-naive-bayes`.

### Extending the databases

To add species without a full rebuild, see `code/Extend reference.Rmd`
in the GitHub repository — it queries NCBI directly and runs on a laptop
in minutes, writing a new suffixed file pair rather than modifying
these. Set `SOURCE <- "plastome"` for plants whose only trnL sequence is
inside a complete chloroplast genome.

## Provenance and reproducibility

-   Pipeline: <https://github.com/LAD-LAB/food-dbs> —
    `foodseq_reference_pipeline.Rmd`, run as
    `foodseq_reference_pipeline_Aug2026Run.Rmd` for the August 2026
    cluster build; the September and October 2026 additions were made
    with `code/Extend reference.Rmd` and `code/functions/query_ncbi_plastome.R`.
    These files correspond to commit
    `[commit hash — fill in after the release-2026.11 branch is merged]`.
-   NCBI data accessed: RefSeq plastid and mitochondrial releases and
    GenBank nucleotide, August 2026 (cluster build); GenBank queried
    again in September and in 22–28 October 2026 for the additions, and in
    November 2026 for the checks behind the omissions.
-   Taxonomy: NCBI Taxonomy via `taxonomizr` for the cluster build, and
    live via the E-utilities for the additions. GBIF was consulted only
    to propose corrections to food-list names; it is not a source of any
    sequence or lineage in these files.
-   Software: R 4.5, Biostrings, ShortRead, taxonomizr, rentrez,
    pwalign, MButils.

## Acknowledgements

[Lab, funding, contributors to `human-foods.csv` (BP, JL, SJ), and
Ashish Subramanian for the 2025 trnL c/d compilation that validated the
alignment-based extraction method.]

## Citation

`[DOI of this version — assigned by Zenodo on deposit]`; previous
versions 10.5281/zenodo.23772049 (2026.10) and 10.5281/zenodo.22756737
(2026.08).
