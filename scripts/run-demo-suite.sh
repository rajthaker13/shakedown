#!/usr/bin/env bash
# Evaluate four inference configurations of the same ACT checkpoint on the full suite.
# The checkpoint is downloaded from Hugging Face on first use.
set -u
cd "$(dirname "$0")/.."
mkdir -p runs
CK=lerobot/act_aloha_sim_transfer_cube_human
S=scenarios/aloha-transfer-cube
SD=engine/.venv/bin/shakedown
$SD run $S -p "lerobot:$CK" -l act-chunk100 -o runs/act-chunk100 -w 8 --no-progress > runs/act-chunk100.log 2>&1
$SD run $S -p "lerobot:$CK?n_action_steps=50" -l act-chunk50 -o runs/act-chunk50 -w 8 --no-progress -b runs/act-chunk100 > runs/act-chunk50.log 2>&1
$SD run $S -p "lerobot:$CK?n_action_steps=25" -l act-chunk25 -o runs/act-chunk25 -w 8 --no-progress -b runs/act-chunk100 > runs/act-chunk25.log 2>&1
$SD run $S -p "lerobot:$CK?temporal_ensemble_coeff=0.01" -l act-ensemble -o runs/act-ensemble -w 8 --no-progress -b runs/act-chunk100 > runs/act-ensemble.log 2>&1
echo done > runs/ALL_DONE
