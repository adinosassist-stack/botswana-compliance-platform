import { WORK_STAGES } from './work-board-readonly.js';

/** Safe, read-only renderer for a previously authorized Work board projection.
 * No data fetching, mutations, event handlers or HTML injection.
 */
export function renderWorkBoard(container, board) {
  if (!container || typeof container.replaceChildren !== 'function') throw new TypeError('invalid_container');
  if (!board || board.previewOnly !== true || !board.lanes || !board.counts) throw new TypeError('invalid_board');
  const doc = container.ownerDocument;
  const root = doc.createElement('section');
  root.className = 'thebe-work-board';
  root.setAttribute('aria-label', 'Work task overview');
  const header = doc.createElement('header');
  const heading = doc.createElement('h2');
  heading.textContent = 'Work overview';
  const hint = doc.createElement('p');
  hint.textContent = 'Read-only overview · Changes require authorized task actions';
  header.append(heading, hint);
  root.append(header);
  const summary = doc.createElement('div');
  summary.className = 'thebe-work-summary';
  summary.setAttribute('aria-label', 'Task totals');
  for (const [label, value] of [['Total', WORK_STAGES.reduce((n,s)=>n+board.counts[s],0)], ['Overdue', board.overdue]]) {
    const stat=doc.createElement('div');
    const title=doc.createElement('span'); title.textContent=label;
    const count=doc.createElement('strong'); count.textContent=String(value);
    stat.append(title,count);summary.append(stat);
  }
  root.append(summary);
  const lanes=doc.createElement('div');
  lanes.className='thebe-work-lanes';
  for (const stage of WORK_STAGES) {
    if (!Array.isArray(board.lanes[stage])) throw new TypeError('invalid_lane');
    const section=doc.createElement('section');
    section.className='thebe-work-lane';
    const title=doc.createElement('h3');
    title.textContent=stage.replaceAll('_',' ')+' ('+board.counts[stage]+')';
    section.append(title);
    const list=doc.createElement('ul');
    for (const task of board.lanes[stage]) {
      const item=doc.createElement('li');
      const name=doc.createElement('strong');name.textContent=task.title;
      item.append(name);
      if (task.dueDate) {
        const due=doc.createElement('span');
        due.textContent='Due '+task.dueDate+(task.overdue?' · Overdue':'');
        item.append(due);
      }
      list.append(item);
    }
    if (!list.childNodes.length) {
      const empty=doc.createElement('p');empty.textContent='No tasks';section.append(empty);
    } else section.append(list);
    lanes.append(section);
  }
  root.append(lanes);
  container.replaceChildren(root);
  return root;
}
