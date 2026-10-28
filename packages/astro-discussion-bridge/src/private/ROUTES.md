# V4 current candidate routes

Generated from normative/CONTRACT.json. Content Connection authorization and current scope/policy apply to every shared route. No older-version route/negotiation is accepted. Native admin interfaces are separately protected current forum operations, not adapter grants.

| ID | Method | Path | Input/query | Response | Success |
|---|---|---|---|---|---|
| V4-01 | GET | /discussion-bridge/v4/connection.json | none | Connection | 200 |
| V4-02 | POST | /discussion-bridge/v4/bridge-records/resolve.json | ToResolve | ResolveResult | 200, 201 |
| V4-03 | GET | /discussion-bridge/v4/bridge-records.json | query CursorQuery | RecordPage | 200 |
| V4-04 | GET | /discussion-bridge/v4/bridge-records/{resource_id}.json | none | Record | 200 |
| V4-05 | POST | /discussion-bridge/v4/bridge-records/{resource_id}/withdraw.json | WithdrawInput | Record | 200 |
| V4-06 | GET | /discussion-bridge/v4/sources.json | query SourceFeedQuery | SourceFeed | 200 |
| V4-07 | GET | /discussion-bridge/v4/sources/{source_id}/revisions/{source_revision}/content.json | query ContentQuery | ContentChunk | 200 |
| V4-08 | GET | /discussion-bridge/v4/policy.json | none | Policy | 200 |
| V4-09 | POST | /discussion-bridge/v4/mappings/prepare.json | MappingPrepare | Mapping | 200, 201 |
| V4-10 | GET | /discussion-bridge/v4/mappings.json | query CursorQuery | MappingPage | 200 |
| V4-11 | GET | /discussion-bridge/v4/mappings/{mapping_id}.json | none | Mapping | 200 |
| V4-12 | GET | /discussion-bridge/v4/mappings/{mapping_id}/url-history.json | query CursorQuery | UrlHistoryPage | 200 |
| V4-13 | POST | /discussion-bridge/v4/work/claim.json | Claim | Lease | 200, 204 |
| V4-14 | GET | /discussion-bridge/v4/work/{work_id}.json | none | WorkQueryResponse | 200 |
| V4-15 | POST | /discussion-bridge/v4/work/{work_id}/renew.json | Renew | Lease | 200 |
| V4-16 | POST | /discussion-bridge/v4/work/{work_id}/acknowledge.json | Ack | WorkQueryResponse | 200 |
| V4-17 | POST | /discussion-bridge/v4/work/{work_id}/fail.json | Failure | WorkQueryResponse | 200 |
| V4-18 | POST | /discussion-bridge/v4/work/{work_id}/prepare.json | StaticPreparation | WorkQueryResponse | 200 |
| V4-19 | POST | /discussion-bridge/v4/work/{work_id}/finalize.json | StaticFinalize | WorkQueryResponse | 200 |
| V4-20 | POST | /discussion-bridge/v4/work/{work_id}/abort.json | StaticAbort | WorkQueryResponse | 200 |
| V4-21 | POST | /discussion-bridge/v4/mappings/{mapping_id}/url-moves.json | UrlMovePrepare | UrlMove | 201, 200 |
| V4-22 | POST | /discussion-bridge/v4/mappings/{mapping_id}/url-moves/{move_id}/finalize.json | UrlMoveFinalize | Mapping | 200 |
| V4-23 | POST | /discussion-bridge/v4/mappings/{mapping_id}/url-moves/{move_id}/abort.json | UrlMoveAbort | UrlMove | 200 |
| V4-24 | POST | /discussion-bridge/v4/catalog/uploads.json | CatalogBegin | CatalogUpload | 201 |
| V4-25 | POST | /discussion-bridge/v4/catalog/uploads/{upload_id}/pages.json | CatalogPageInput | CatalogUpload | 200 |
| V4-26 | POST | /discussion-bridge/v4/catalog/uploads/{upload_id}/finalize.json | CatalogFinalize | CatalogResponse | 200 |
| V4-27 | GET | /discussion-bridge/v4/catalog.json | query CatalogReadQuery | CatalogResponse | 200 |
| V4-28 | POST | /discussion-bridge/v4/bridge-records/{resource_id}/source-url-moves.json | SourceUrlMovePrepare | SourceUrlMove | 200, 201 |
| V4-29 | POST | /discussion-bridge/v4/bridge-records/{resource_id}/source-url-moves/{move_id}/finalize.json | SourceUrlMoveFinalize | Record | 200 |
| V4-30 | POST | /discussion-bridge/v4/bridge-records/{resource_id}/source-url-moves/{move_id}/abort.json | SourceUrlMoveAbort | SourceUrlMove | 200 |
| V4-31 | GET | /discussion-bridge/v4/bridge-records/{resource_id}/url-history.json | query CursorQuery | UrlHistoryPage | 200 |
| V4-32 | GET | /discussion-bridge/v4/attention-recovery.json | none | AttentionRecoveryCapability | 200 |
| V4-33 | GET | /discussion-bridge/v4/attention-inspections.json | query AttentionFeedQuery | AttentionInspectionPage | 200 |
| V4-34 | POST | /discussion-bridge/v4/attention-inspections/{inspection_id}/report.json | AttentionInspectionReport | AttentionInspectionResult | 200 |
| V4-35 | GET | /discussion-bridge/v4/work/recoveries.json | query AttentionFeedQuery | AttentionRecoveryPage | 200 |
| V4-36 | POST | /discussion-bridge/v4/work/recoveries/{recovery_id}/claim.json | AttentionRecoveryClaim | Lease | 200, 204 |

## Protected native interfaces

| ID | Method | Path | Authority |
|---|---|---|---|
| NATIVE-01 | POST | /admin/publishing/topics/{topic_id}/publish | native_session_csrf_xhr_staff_guardian_publisher_enabled |
| NATIVE-02 | PUT | /admin/publishing/publications/{resource_id}/presentation | native_session_csrf_xhr_staff_guardian_publisher_enabled |
| NATIVE-03 | GET | /admin/publishing/topics/{topic_id}/status | native_session_csrf_xhr_staff_guardian_publisher_enabled |
| NATIVE-04 | GET | /admin/publishing | native_admin |
| NATIVE-05 | GET/PUT | /admin/content-connections/{connection_id}/cms-configuration | native_admin |
| NATIVE-06 | GET | /admin/content-connections/{connection_id}/cms-delivery | native_admin |
| NATIVE-07 | GET | /admin/content-connections/{connection_id}/cms-preview | native_admin |
| NATIVE-08 | GET | /admin/content-connections/{connection_id}/cms-catalog | native_admin |
| NATIVE-09 | POST | /admin/content-connections/{connection_id}/cms-attention/check | native_session_csrf_xhr_admin_guardian_current_connection_topic |
| NATIVE-10 | POST | /admin/content-connections/{connection_id}/cms-attention/retry | native_session_csrf_xhr_admin_guardian_current_connection_topic |

Exact native fields and source/policy/shared-engine/URL-lock rules are in the normative source. Unselected HTML/source-public proof, actual native attention-profile qualification and support-access mechanisms remain separate from route declarations.
