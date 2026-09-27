import { countdownLabel, fixtureTitle, kickoffText, statusLabel } from '../logic/agenda.ts';
import { sportLabel } from '../logic/clubs.ts';
import { competitionName, type DemoSchedule } from '../logic/schedule.ts';
import type { Fixture } from '../../../../packages/domain/src/types.ts';

export function FixtureCard(props: {
  fixture: Fixture;
  schedule: DemoSchedule;
  timeZone: string;
  now: number;
  followed: boolean;
}) {
  const { fixture, schedule, timeZone, now, followed } = props;
  const countdown = countdownLabel(fixture, now);
  return (
    <article className="card">
      <p className="kicker">
        <span className="demo">DEMO</span>
        <span>{sportLabel(fixture.sport)}</span>
        <span>{competitionName(schedule, fixture.competitionId)}</span>
      </p>
      <h3>{fixtureTitle(fixture, schedule.teams)}</h3>
      <p>{kickoffText(fixture, timeZone)}</p>
      {countdown ? <p className="countdown">{countdown}</p> : null}
      <p className="meta">
        {statusLabel(fixture.status)}
        {fixture.venue ? ` · ${fixture.venue}` : ''}
        {fixture.round ? ` · ${fixture.round}` : ''}
      </p>
      {followed ? <p className="meta">Pratim u aplikaciji</p> : null}
      <p className="meta">Nije stvarna utakmica. Upis u Google kalendar nije deo ove faze.</p>
    </article>
  );
}
