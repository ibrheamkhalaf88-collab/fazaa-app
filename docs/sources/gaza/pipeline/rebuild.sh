#!/bin/sh
# Rebuild the final texts from the three readings, in a fixed order. Every step is deterministic.
O="$1"
set -e
for law in hn sp; do python -W ignore "$O/reconcile.py" "$O" $law; done
python -W ignore "$O/manual_fixes.py" "$O"
for law in hn sp; do python -W ignore "$O/vote3.py" "$O" $law; done
python -W ignore "$O/end_fixes.py" "$O"
python -W ignore "$O/word_fixes.py" "$O"
