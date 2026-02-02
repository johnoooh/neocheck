"""Input validation for mutations and HLA alleles."""

import re
from config import HLA_LOCI


def parse_mutation(text: str) -> tuple[str | None, str]:
    """Parse a mutation string into (gene, mutation) tuple.

    Accepts formats:
        - "G12D" -> (None, "G12D")
        - "KRAS G12D" -> ("KRAS", "G12D")
        - "p.G12D" -> (None, "G12D")
        - "KRAS p.G12D" -> ("KRAS", "G12D")
    """
    text = text.strip()
    # Remove "p." prefix
    text = re.sub(r'\bp\.', '', text)

    parts = text.split()
    if len(parts) == 2:
        return parts[0].upper(), parts[1].upper()
    elif len(parts) == 1:
        return None, parts[0].upper()
    return None, text.upper()


def validate_mutation(mutation: str) -> tuple[bool, str]:
    """Validate mutation format. Returns (is_valid, message)."""
    mutation = mutation.strip()
    if not mutation:
        return False, "Mutation is required."
    # Standard amino acid substitution: single letter + position + single letter
    pattern = r'^[ACDEFGHIKLMNPQRSTVWY]\d+[ACDEFGHIKLMNPQRSTVWY]$'
    if re.match(pattern, mutation.upper()):
        return True, ""
    return False, f"Invalid mutation format: '{mutation}'. Expected format like G12D, V600E."


def normalize_hla_allele(text: str) -> str | None:
    """Normalize an HLA allele string to standard format.

    Accepts:
        - "A*02:01" -> "HLA-A*02:01"
        - "HLA-A*02:01" -> "HLA-A*02:01"
        - "A*02:01:01:01" -> "HLA-A*02:01"
        - "B*07:02" -> "HLA-B*07:02"

    Returns None if format is invalid.
    """
    text = text.strip().upper()
    if not text:
        return None

    # Remove HLA- prefix if present
    text = re.sub(r'^HLA-', '', text)

    # Match pattern: LOCUS*FIELD1:FIELD2[:FIELD3[:FIELD4]]
    match = re.match(
        r'^([ABC])\*(\d{2,4}):(\d{2,4})(?::(\d{2,4}))?(?::(\d{2,4}))?$',
        text
    )
    if not match:
        return None

    locus = match.group(1)
    if locus not in HLA_LOCI:
        return None

    # Return with HLA- prefix, using first two fields for CEDAR queries
    return f"HLA-{locus}*{match.group(2)}:{match.group(3)}"


def normalize_hla_allele_full(text: str) -> str | None:
    """Normalize HLA allele keeping all fields (for IMGT queries)."""
    text = text.strip().upper()
    if not text:
        return None

    text = re.sub(r'^HLA-', '', text)

    match = re.match(
        r'^([ABC])\*(\d{2,4}):(\d{2,4})(?::(\d{2,4}))?(?::(\d{2,4}))?$',
        text
    )
    if not match:
        return None

    locus = match.group(1)
    if locus not in HLA_LOCI:
        return None

    parts = [match.group(2), match.group(3)]
    if match.group(4):
        parts.append(match.group(4))
    if match.group(5):
        parts.append(match.group(5))

    return f"{locus}*{':'.join(parts)}"


def validate_hla_allele(text: str) -> tuple[bool, str]:
    """Validate HLA allele format. Returns (is_valid, message)."""
    text = text.strip()
    if not text:
        return True, ""  # Empty is OK (optional field)
    result = normalize_hla_allele(text)
    if result is None:
        return False, f"Invalid HLA format: '{text}'. Expected format like A*02:01 or HLA-A*02:01."
    return True, ""
