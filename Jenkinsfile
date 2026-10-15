pipeline {
    agent { label 'adtool-build' }

    tools {
        nodejs 'node24'
    }

    options {
        timeout(time: 40, unit: 'MINUTES')
        disableConcurrentBuilds()
        skipDefaultCheckout(true)
        buildDiscarder(logRotator(
            numToKeepStr: '10',
            artifactNumToKeepStr: '3'
        ))
    }

    environment {
        AWS_REGION = 'eu-central-1'
        AWS_DEFAULT_REGION = 'eu-central-1'
        AWS_PAGER = ''
        AMPLIFY_APP_ID = 'd1gryl4kp52246'
        AMPLIFY_BRANCH = 'staging'
        SITE_URL = 'https://prodtest.useadtool.ai'
        PATH+AWSCLI = '/usr/local/bin'
    }

    stages {
        stage('Checkout main') {
            steps {
                deleteDir()
                checkout scm
                sh 'test "$BRANCH_NAME" = main'
            }
        }

        stage('Verify AWS access') {
            steps {
                sh '''
                    set -eu
                    aws sts get-caller-identity --query Arn --output text
                '''
            }
        }

        stage('Install dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Build frontend') {
            steps {
                sh '''
                    set -eu
                    npm run build
                    test -s dist/index.html
                    git rev-parse HEAD > dist/jenkins-commit.txt
                '''
            }
        }

        stage('Package frontend') {
            steps {
                sh '''
                    set -eu
                    cd dist
                    zip -qr ../frontend.zip .
                '''

                archiveArtifacts(
                    artifacts: 'frontend.zip',
                    fingerprint: true
                )
            }
        }

        stage('Deploy prodtest') {
            when {
                branch 'main'
            }

            steps {
                sh '''
                    set +x
                    set -eu
                    umask 077

                    deployment_file=$(mktemp)
                    trap 'rm -f "$deployment_file"' EXIT

                    aws amplify create-deployment \
                        --app-id "$AMPLIFY_APP_ID" \
                        --branch-name "$AMPLIFY_BRANCH" \
                        --output json > "$deployment_file"

                    job_id=$(jq -er '.jobId' "$deployment_file")
                    upload_url=$(jq -er '.zipUploadUrl' "$deployment_file")

                    echo "Uploading frontend for deployment $job_id"

                    curl --fail --silent --show-error \
                        --connect-timeout 30 \
                        --max-time 600 \
                        --upload-file frontend.zip \
                        "$upload_url"

                    unset upload_url

                    aws amplify start-deployment \
                        --app-id "$AMPLIFY_APP_ID" \
                        --branch-name "$AMPLIFY_BRANCH" \
                        --job-id "$job_id" \
                        --query 'jobSummary.jobId' \
                        --output text

                    for attempt in $(seq 1 120); do
                        status=$(aws amplify get-job \
                            --app-id "$AMPLIFY_APP_ID" \
                            --branch-name "$AMPLIFY_BRANCH" \
                            --job-id "$job_id" \
                            --query 'job.summary.status' \
                            --output text)

                        echo "Deployment $job_id: $status"

                        case "$status" in
                            SUCCEED)
                                exit 0
                                ;;
                            FAILED|CANCELLED)
                                exit 1
                                ;;
                        esac

                        sleep 5
                    done

                    echo "Timed out waiting for Amplify deployment"
                    exit 1
                '''
            }
        }

        stage('Verify deployed commit') {
            steps {
                sh '''
                    set -eu
                    expected_commit=$(git rev-parse HEAD)

                    for attempt in $(seq 1 12); do
                        served_commit=$(curl \
                            --fail --silent --show-error \
                            --connect-timeout 10 \
                            --max-time 20 \
                            "$SITE_URL/jenkins-commit.txt?build=$BUILD_NUMBER" \
                            || true)

                        if [ "$served_commit" = "$expected_commit" ]; then
                            echo "Verified deployed commit: $served_commit"
                            echo "Website: $SITE_URL"
                            exit 0
                        fi

                        sleep 5
                    done

                    echo "Could not verify the new commit on prodtest"
                    exit 1
                '''
            }
        }
    }
}
