const klyft = require('./../../klyft')

klyft.enableDebug(true)

const worker = new klyft.Worker('jobs.js', false, 1, true, false)

function repeat(n) {
   if(n === 0) {
      worker.kill()
      return
   }

   worker.queue('job').then(() => {
      console.log(`${--n} time(s) left`)
      
      setTimeout(() => {
         repeat(n)
      }, 100)
   })   
}

repeat(3)
