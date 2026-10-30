pipeline {
    agent { label 'adtool-build' }

    tools {
        nodejs 'node24'
    }

    parameters {
        string(name: 'AWS_PUBLIC_ANON_CREDENTIAL_ID', defaultValue: 'adtool-aws-public-anon-key',
            description: 'Jenkins Secret text credential containing the reviewed AWS public anon JWT (never a service-role key).')
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
        AWS_CLI = '/usr/local/bin/aws'
        VITE_AWS_TEST_SUPABASE_URL = 'https://api-prod.useadtool.ai'
        FRONTEND_DIST = 'dist-aws-test'
    }

    stages {
        stage('Checkout deploy branch') {
            steps {
                deleteDir()
                checkout scm
                sh 'case "$BRANCH_NAME" in main|codex/aws-fresh-migration) ;; *) exit 1 ;; esac'
            }
        }

        stage('Verify AWS access') {
            steps {
                sh '''
                    set -eu
                    "$AWS_CLI" --version
                    "$AWS_CLI" sts get-caller-identity \
                        --query Arn \
                        --output text
                '''
            }
        }

        stage('Install dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Validate AWS frontend') {
            steps {
                sh '''
                    set -eu
                    npm run test:aws-test-config
                    node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
                    node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json
                    node node_modules/vitest/vitest.mjs run \
                        src/lib/__tests__/awsBootstrap.test.ts \
                        src/lib/__tests__/awsValidationFetch.test.ts \
                        src/hooks/__tests__/awsBootstrapAuth.test.tsx \
                        src/hooks/__tests__/awsUserRoles.test.ts \
                        src/integrations/supabase/__tests__/awsTestClient.test.ts \
                        src/pages/__tests__/AwsValidation.test.tsx
                '''
            }
        }

        stage('Build AWS frontend') {
            steps {
                withCredentials([string(credentialsId: (params.AWS_PUBLIC_ANON_CREDENTIAL_ID ?: 'adtool-aws-public-anon-key'),
                    variable: 'VITE_AWS_TEST_SUPABASE_ANON_KEY')]) {
                    sh '''
                        set +x
                        set -eu
                        npm run build:aws
                        npm run verify:aws-build
                        git rev-parse HEAD > "$FRONTEND_DIST/jenkins-commit.txt"
                    '''
                }
            }
        }

        stage('Package frontend') {
            steps {
                sh '''
                    set -eu
                    cd "$FRONTEND_DIST"
                    zip -qr ../frontend.zip .
                '''

                archiveArtifacts(
                    artifacts: 'frontend.zip,dist-aws-test/backend-profile.json,dist-aws-test/jenkins-commit.txt',
                    fingerprint: true
                )
            }
        }

        stage('Deploy prodtest') {
            when {
                anyOf {
                    branch 'main'
                    branch 'codex/aws-fresh-migration'
                }
            }

            steps {
                sh '''
                    set +x
                    set -eu
                    umask 077

                    deployment_file=$(mktemp)
                    trap 'rm -f "$deployment_file"' EXIT

                    "$AWS_CLI" amplify create-deployment \
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

                    "$AWS_CLI" amplify start-deployment \
                        --app-id "$AMPLIFY_APP_ID" \
                        --branch-name "$AMPLIFY_BRANCH" \
                        --job-id "$job_id" \
                        --query 'jobSummary.jobId' \
                        --output text

                    for attempt in $(seq 1 120); do
                        status=$("$AWS_CLI" amplify get-job \
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
                            profile_file=$(mktemp)
                            trap 'rm -f "$profile_file"' EXIT
                            curl --fail --silent --show-error \
                                --connect-timeout 10 --max-time 20 \
                                "$SITE_URL/backend-profile.json?build=$BUILD_NUMBER" > "$profile_file"
                            node scripts/verify-aws-build.mjs --profile "$profile_file"
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
