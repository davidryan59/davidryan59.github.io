/* Runs the walk and the tumbling Close search away from the page. */

import { walkPath } from './compute.js';
import { closeByWalk } from './close.js';

self.onmessage = ({ data }) => {
  const { id, kind, spec, quality } = data;
  const progress = share => self.postMessage({ id, type: 'progress', share });
  if (kind === 'walk') {
    const path = walkPath(spec, quality, progress);
    self.postMessage({ id, type: 'done', path }, [path.poses.buffer]);
  } else if (kind === 'close') {
    self.postMessage({ id, type: 'done', result: closeByWalk(spec, { onProgress: progress }) });
  }
};
