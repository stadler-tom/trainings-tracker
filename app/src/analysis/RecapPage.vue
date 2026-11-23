<script setup lang="ts">
// Page "Recap": one statement per tile (traffic light, weight, stalls, weekly sets, "Eingeschränkt").
import { computed } from 'vue';
import { signedKg } from '../body';
import { addDays, formatIsoDate, todayIso } from '../format';
import { formatNumber } from '../training';
import { signed, type AnalysisData, type ExerciseStats } from './analysis';
import { bodyComparison, limitedTracking, plannedStats, recomposition, stalls, weekSets, STRENGTH_WINDOW_DAYS, TREND_DAYS } from './recap';

const props = defineProps<{ data: AnalysisData; stats: Map<string, ExerciseStats> }>();
const emit = defineEmits<{ open: [id: string] }>();

const today = todayIso();
const short = (iso: string) => formatIsoDate(iso).slice(0, 6);

const recomp = computed(() => recomposition(props.data, props.stats, today));
const body = computed(() => bodyComparison(props.data, today));
const stalled = computed(() => stalls(plannedStats(props.data, props.stats)));
const sets = computed(() => weekSets(props.data, today));
const limited = computed(() => limitedTracking(props.stats, today));
const limitedMax = computed(() => Math.max(1, ...limited.value.weeks.map((w) => w.count)));

const LIGHT_TEXT = { green: 'Grün', yellow: 'Gelb', red: 'Rot', none: 'Keine Bewertung' } as const;
const TREND_TEXT = {
  none: 'Keine eingeschränkten Übungen in den letzten 6 Wochen.',
  better: 'Weniger als in den 3 Wochen davor – es wird besser.',
  same: 'Gleich viele wie in den 3 Wochen davor.',
  worse: 'Mehr als in den 3 Wochen davor.',
} as const;
</script>

<template>
  <div class="a-bar"><h1>Recap</h1></div>

  <div class="r-grid">
    <!-- 1: recomposition traffic light -->
    <section class="a-card">
      <h2>Rekompositions-Ampel</h2>
      <div class="r-light-row">
        <span class="r-light" :class="recomp.light" role="img" :aria-label="LIGHT_TEXT[recomp.light]"></span>
        <strong class="r-verdict">{{ recomp.verdict }}</strong>
      </div>
      <div class="r-facts">
        <div>
          <div class="a-label">Gewichtstrend ({{ TREND_DAYS / 7 }} Wochen)</div>
          <div class="r-fact">{{ recomp.slope === null ? '–' : `${signedKg(recomp.slope)}/Woche` }}</div>
          <div class="a-label">Ziel {{ signedKg(recomp.target) }}/Woche</div>
        </div>
        <div>
          <div class="a-label">Kraftindex</div>
          <div class="r-fact">{{ recomp.strength ? `${signed(recomp.strength.median)} %` : '–' }}</div>
          <div class="a-label">{{ recomp.strength ? `Median aus ${recomp.strength.count} Übungen` : 'zu wenig Übungen' }}</div>
        </div>
      </div>
      <p class="r-advice">{{ recomp.advice }}</p>
      <p v-if="recomp.reentry" class="r-hint">
        Wiedereinstieg nach Pause seit {{ formatIsoDate(recomp.reentry) }}: Der Kraftanstieg ist größtenteils Muskelgedächtnis.
      </p>
      <p class="a-note">
        Gewichtstrend: Gerade durch alle Wiegungen der letzten {{ TREND_DAYS }} Tage. Kraftindex: bestes e1RM jeder Übung der letzten
        {{ STRENGTH_WINDOW_DAYS / 7 }} Wochen gegen die {{ STRENGTH_WINDOW_DAYS / 7 }} Wochen davor, Median über alle Übungen im Plan.
        Ohne Deload, eingeschränkte Sätze, 1RM-Tests und Drops.
      </p>
    </section>

    <!-- 2: weight week X vs X−2 and waist -->
    <section class="a-card">
      <h2>Gewicht und Bauchumfang</h2>
      <template v-if="body.weight">
        <div class="r-facts">
          <div>
            <div class="a-label">Woche ab {{ short(body.weight.week.start) }}</div>
            <div class="r-fact">{{ formatNumber(Math.round(body.weight.week.average * 10) / 10) }} kg</div>
            <div class="a-label">{{ body.weight.week.count }} Wiegungen</div>
          </div>
          <div>
            <div class="a-label">2 Wochen davor (ab {{ short(body.weight.compare.start) }})</div>
            <div class="r-fact">{{ formatNumber(Math.round(body.weight.compare.average * 10) / 10) }} kg</div>
            <div class="a-label">{{ body.weight.compare.count }} Wiegungen</div>
          </div>
          <div>
            <div class="a-label">Veränderung</div>
            <div class="r-fact" :class="body.weight.status === 'onTrack' ? 'a-good' : 'a-bad'">{{ signedKg(body.weight.change) }}</div>
            <div class="a-label">geplant {{ signedKg(body.weight.expected) }}</div>
          </div>
        </div>
        <strong>{{ body.weight.text }}</strong>
        <p v-if="body.weight.advice" class="r-advice">{{ body.weight.advice }}</p>
      </template>
      <p v-else class="a-muted">Noch kein Vergleich möglich: Es braucht zwei Wochen im Abstand von 2 Wochen mit je mindestens 3 Wiegungen.</p>
      <div class="r-divider"></div>
      <div v-if="body.waist" class="r-facts">
        <div>
          <div class="a-label">Bauchumfang ({{ short(body.waist.date) }})</div>
          <div class="r-fact">{{ formatNumber(body.waist.latest) }} cm</div>
        </div>
        <div>
          <div class="a-label">Veränderung (3+ Wochen)</div>
          <div class="r-fact" :class="body.waist.change === null ? '' : body.waist.change < 0 ? 'a-good' : body.waist.change > 0 ? 'a-bad' : ''">
            {{ body.waist.change === null ? '–' : signedKg(body.waist.change, 'cm') }}
          </div>
        </div>
      </div>
      <p v-else class="a-muted">Noch kein Bauchumfang eingetragen.</p>
      <p class="a-note">Bewertet wird der Wochenschnitt gegen den von vor 2 Wochen, nie ein einzelner Tag.</p>
    </section>

    <!-- 3: stalled exercises -->
    <section class="a-card">
      <h2>Stillstand</h2>
      <template v-if="stalled.length">
        <ul class="r-list">
          <li v-for="s in stalled" :key="s.stats.exercise.id">
            <button type="button" class="a-link" @click="emit('open', s.stats.exercise.id)">{{ s.stats.exercise.name }}</button>
            <span class="a-muted">{{ s.sessions }} Einheiten ohne Fortschritt, zuletzt besser am {{ short(s.since) }}</span>
          </li>
        </ul>
        <p class="r-advice">Wiederholungsbereich, Schlaf und Technik prüfen. Bleibt es bei vielen Übungen so: Deload oder Ernährung prüfen.</p>
      </template>
      <p v-else class="r-ok">Keine Übung im Plan steht still.</p>
      <p class="a-note">
        Stillstand: 3 Einheiten in Folge ohne höheres e1RM und ohne schwereres Gewicht als bei der letzten Einheit mit Fortschritt.
        Eine Gewichtserhöhung zählt als Fortschritt, auch wenn danach Wiederholungen fehlen.
      </p>
    </section>

    <!-- 4: weekly sets below plan -->
    <section class="a-card">
      <h2>Wochensätze nicht erreicht</h2>
      <p class="a-label">Woche {{ short(sets.week) }}–{{ short(addDays(sets.week, 6)) }}<template v-if="sets.deload"> · Deload, halbes Soll</template></p>
      <template v-if="!sets.hasPlan">
        <p class="a-muted">Für das Soll braucht es die Sätze pro Übung aus den Tag-Blättern (Script ab 1.8.0).</p>
      </template>
      <template v-else-if="sets.short.length">
        <table class="a-table">
          <thead><tr><th>Muskelgruppe</th><th class="num">Ist</th><th class="num">Soll</th><th class="num">fehlen</th></tr></thead>
          <tbody>
            <tr v-for="s in sets.short" :key="s.group">
              <td>{{ s.group }}</td><td class="num">{{ s.done }}</td><td class="num">{{ s.planned }}</td>
              <td class="num a-bad">{{ s.planned - s.done }}</td>
            </tr>
          </tbody>
        </table>
      </template>
      <p v-else class="r-ok">Alle {{ sets.groups }} Muskelgruppen haben ihr Soll erreicht.</p>
      <p class="a-note">Soll: Sätze aus den Tag-Blättern, jeder Trainingstag einmal pro Woche. Ist: alle Sätze der Woche ohne Drops, 1RM-Tests und Aufwärmübungen.</p>
    </section>

    <!-- 5: "Eingeschränkt" -->
    <section class="a-card">
      <h2>Eingeschränkt</h2>
      <div class="r-bars" role="img" aria-label="Eingeschränkte Übungen pro Woche">
        <div v-for="w in limited.weeks" :key="w.week" class="r-bar-col">
          <span class="r-bar-value">{{ w.count }}</span>
          <div class="r-bar" :style="{ height: `${(w.count / limitedMax) * 60}px` }"></div>
          <span class="a-label">{{ short(w.week) }}</span>
        </div>
      </div>
      <strong :class="{ 'a-good': limited.trend === 'better' || limited.trend === 'none', 'a-bad': limited.trend === 'worse' }">
        {{ TREND_TEXT[limited.trend] }}
      </strong>
      <ul v-if="limited.exercises.length" class="r-list">
        <li v-for="e in limited.exercises" :key="e.name">
          <strong>{{ e.name }}</strong>
          <span class="a-muted">{{ e.count }}× · zuletzt {{ short(e.lastDate) }}<template v-if="e.reason"> · „{{ e.reason }}“</template></span>
        </li>
      </ul>
      <p class="a-note">Gezählt werden Übungen pro Training mit Haken „Eingeschränkt“, die letzten 6 Wochen inklusive der laufenden.</p>
    </section>
  </div>
</template>

<style scoped>
.r-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 16px; }
.r-grid p.a-label { margin: 0; }
.r-light-row { display: flex; align-items: center; gap: 14px; }
.r-light { width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0; background: var(--a-line2); box-shadow: inset 0 -3px 0 rgb(0 0 0 / 0.12); }
.r-light.green { background: #16a34a; }
.r-light.yellow { background: #eab308; }
.r-light.red { background: #dc2626; }
.r-verdict { font-size: 18px; line-height: 1.35; }
.r-facts { display: flex; flex-wrap: wrap; gap: 12px 32px; }
.r-fact { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.r-advice { margin: 0; font-size: 14px; line-height: 1.5; }
.r-hint { margin: 0; padding: 8px 12px; border-radius: 10px; font-size: 14px; background: #dbeafe; color: #1e40af; }
.r-ok { margin: 0; font-weight: 600; color: #15803d; }
.r-divider { border-top: 1px solid var(--a-line); }
.r-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.r-list li { display: flex; flex-direction: column; gap: 2px; font-size: 14px; }
.r-bars { display: flex; align-items: flex-end; gap: 10px; height: 100px; }
.r-bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.r-bar { width: 100%; max-width: 40px; min-height: 2px; border-radius: 4px 4px 0 0; background: var(--a-chart); }
.r-bar-value { font-size: 13px; font-weight: 600; }
</style>
