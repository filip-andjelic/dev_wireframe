'use strict';

angular.module('mwpApp')
    .directive('smpPerformanceGauge', ['PerformanceScan', '$timeout',
        function(PerformanceScan, $timeout) {
            return {
                restrict: 'E',
                templateUrl: 'views/components/smp-dashboard/smp-widget/performance-gauge/smp-performance-gauge.html',
                replace: true,
                scope: {
                    grade: '=grade',
                    labels: '=showText',
                    getPrevious: '=getPrevious'
                },
                link: function(scope, element) {
                    function transformMatrix(matrix) {
                        var values = matrix.split('(')[1].split(')')[0].split(',');
                        var X = values[0];
                        var Y = values[1];
                        var degrees = Math.round(Math.atan2(Y, X) * (180 / Math.PI));

                        return degrees;
                    }
                    function makeNewRotation(value, targets) {
                        var currentDegree = 0;
                        var newDegree = 0;
                        var needleShift = 0;

                        switch (value) {
                            case 'A':
                                newDegree = 169;
                                needleShift = -15;
                                break;
                            case 'B':
                                newDegree = 129;
                                needleShift = 4;
                                break;
                            case 'C':
                                newDegree = 97;
                                needleShift = 4;
                                break;
                            case 'D':
                                newDegree = 65;
                                needleShift = 2;
                                break;
                            case 'E':
                                newDegree = 29;
                                needleShift = 0;
                                break;
                        }

                        _.each(targets, function(target, index) {
                            currentDegree = transformMatrix(angular.element(target).css('transform'));
                            angular.element(target).attr('style',
                                '-webkit-transform: rotate(' + parseInt(currentDegree + newDegree + index * needleShift) + 'deg); ' +
                                '-moz-transform: rotate(' + parseInt(currentDegree + newDegree + index * needleShift) + 'deg); ' +
                                '-ms-transform: rotate(' + parseInt(currentDegree + newDegree + index * needleShift) + 'deg); ' +
                                '-o-transform: rotate(' + parseInt(currentDegree + newDegree + index * needleShift) + 'deg);');
                        });
                    }
                    var rotatingElements = angular.element(element.find('.gauge-line-cover, .simple-gauge-needle'));

                    scope.grade = scope.grade ? scope.grade : 0;
                    scope.computedGrade = PerformanceScan.calcGrade(scope.grade);

                    if (scope.computedGrade !== 'F') {
                        $timeout(function() {
                            makeNewRotation(scope.computedGrade, rotatingElements);
                        }, 800);
                    }
                }
            };
        }]);
