import { Board } from './Board'
import { Profile } from './Profile'
import { Schedule } from './Schedule'
import { Tasks } from './Tasks'

// All full-screen dialogs share one stacking context above the persistent HUD.
export function ModalLayer() {
  return (
    <div className="modal-layer">
      <Board />
      <Schedule />
      <Tasks />
      <Profile />
    </div>
  )
}