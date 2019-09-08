const Job = require('./../../klyft').Job
const chalk = require('chalk')

const a = chalk.red

new Job('job-a', function(n, done) {
   let i=0
   setInterval(() => {
      if(i<n) {
         console.log(a(i++))
      } else {
         return done(n)
      }
   }, 100)
})
