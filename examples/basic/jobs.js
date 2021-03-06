const Job = require('./../../klyft').Job

new Job('example-job', function(message, done) {
   console.log('example-job now executing')
   setTimeout(() => {
      return done('processed: ' + message)
   }, 1200)
})

new Job('another-job', function(message, done) {
   console.log('another-job now executing')
   return done('processed: ' + message)
})
