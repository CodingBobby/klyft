const Job = require('./../../klyft').Job

new Job('job', function(j, done) {
   return setTimeout(() => {
      return done()
   }, 2e3)
})
