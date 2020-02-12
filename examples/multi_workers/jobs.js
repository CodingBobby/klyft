const Job = require('./../../klyft').Job
const chalk = require('chalk')

const a = chalk.red
const b = chalk.blue
const c = chalk.yellow
const d = chalk.white

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

new Job('job-b', function(n, done) {
   let i=0
   setInterval(() => {
      if(i<n) {
         console.log(b(i++))
      } else {
         return done(n)
      }
   }, 200)
})

new Job('job-c', function(n, done) {
   let i=0
   setInterval(() => {
      if(i<n) {
         console.log(d(i++))
      } else {
         return done(n)
      }
   }, 200)
})

new Job('job-d', function(n, done) {
   let i=0
   setInterval(() => {
      if(i<n) {
         console.log(c(i++))
      } else {
         return done(n)
      }
   }, 200)
})
