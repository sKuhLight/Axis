"""Build and arm the Megatap capture rig in the FM3's edit buffer.

Chain: Input -> Synth 1 -> Megatap 1 -> Output. The Synth voice drones with Track OFF, so pulsing
its Voice 1 Level is a repeatable impulse that needs no guitar. The Megatap is set to a bare tap
train (no feedback, no diffusion, no randomize, dry killed) so the output VU sees the taps alone.
"""
import sys, time
sys.path.insert(0, '.')
from mega import *

SCRATCH_PRESET = 0   # an empty slot; --grid rebuilds its edit buffer and nothing is ever stored


def build_grid():
    req('/preset/select', {'number': SCRATCH_PRESET}, 'POST')
    time.sleep(1.0)
    for col, bid in ((1, INPUT), (2, SYNTH), (3, MEGATAP), (4, OUTPUT)):
        req('/preset/grid/cell', {'row': 1, 'col': col, 'blockId': bid}, 'PUT')
        time.sleep(0.4)
    for col in (1, 2, 3):
        req('/preset/grid/cable', {'srcRow': 1, 'srcCol': col, 'destRow': 1, 'connect': True}, 'POST')
        time.sleep(0.3)


def arm_synth():
    setp(SYNTH, SY['TYPE1'], 0, continuous=False)      # SINE
    setp(SYNTH, SY['TRACK1'], 0, continuous=False)     # OFF - drones without an input note
    setp(SYNTH, 11, 7, continuous=False)               # voice 2 TYPE2 = OFF
    setp(SYNTH, 29, 7, continuous=False)               # voice 3 TYPE3 = OFF
    for pid, v in ((SY['FREQ1'], (440 - 40) / (4000 - 40)), (SY['ATTACK1'], 0.0), (SY['HICUT1'], 1.0),
                   (SY['PAN1'], 0.5), (SY['LEVEL1'], 0.0), (SY['LEVEL2'], 0.0),
                   (SY['MIX'], 1.0), (SY['LEVEL'], 0.8), (SY['PAN'], 0.5)):
        setp(SYNTH, pid, v)
        time.sleep(0.05)


def arm_megatap(taps=16, time_ms=4000, predelay_ms=0):
    for pid, v in ((MT['INGAIN'], 1.0), (MT['MASTERLVL'], 1.0), (MT['MIX'], 1.0), (MT['LEVEL'], 0.8),
                   (MT['PAN'], 0.5), (MT['FEEDBACK'], 0.0), (MT['DIFFMIX'], 0.0), (MT['RANDOM'], 0.0),
                   (MT['AMPRAND'], 0.0), (MT['SPREAD'], 0.0), (MT['LOWCUT'], 0.0), (MT['HICUT'], 1.0),
                   (MT['TIMEALPHA'], 0.5), (MT['AMPALPHA'], 0.5), (MT['PANALPHA'], 0.5),
                   (MT['TIME'], norm('TIME', time_ms)), (MT['PREDELAY'], norm('PREDELAY', predelay_ms))):
        setp(MEGATAP, pid, v)
        time.sleep(0.05)
    for pid, v in ((MT['KILLDRY'], 1), (MT['NUMTAPS'], taps), (MT['TIMESHAPE'], 0),
                   (MT['AMPSHAPE'], 0), (MT['PANSHAPE'], 0)):
        setp(MEGATAP, pid, v, continuous=False)
        time.sleep(0.05)


def report():
    d = req(f'/preset/blocks/{MEGATAP}/params')
    named = {p['id']: p for p in d['named']}
    enums = {e['id']: e for e in d['enums']}
    label = lambda e: next((o['label'] for o in e['options'] if o['value'] == e['value']), e['value'])
    print(f"taps={enums[3]['value']} time={named[2]['value']:.0f}ms predelay={named[4]['value']:.0f}ms "
          f"mix={named[17]['value']:.0f}% fb={named[24]['value']:.0f}% rand={named[11]['value']:.0f}% "
          f"amprand={named[30]['value']:.0f}% killdry={label(enums[34])}")
    print(f"time={label(enums[5])}/{named[6]['value']:.1f}%  amp={label(enums[7])}/{named[8]['value']:.1f}%  "
          f"pan={label(enums[9])}/{named[10]['value']:.1f}%")


if __name__ == '__main__':
    if '--grid' in sys.argv:
        build_grid()
    arm_synth()
    arm_megatap()
    report()
