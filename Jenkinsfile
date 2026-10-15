pipeline {
    agent { label 'adtool-build' }

    tools {
        nodejs 'node24'
    }

    options {
        timeout(time: 10, unit: 'MINUTES')
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {
        stage('Verify checkout and tools') {
            steps {
                sh '''
                    set -eu
                    git rev-parse HEAD
                    test -f package.json
                    node --version
                    npm --version
                '''
            }
        }
    }
}
