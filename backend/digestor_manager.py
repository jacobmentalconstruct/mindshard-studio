import threading
import structlog
from typing import Any, Dict, List, Optional

from prometheus_client import Counter, Summary
from .digestor import Digestor

log = structlog.get_logger(__name__)

# Metrics
DIGESTOR_INSTANCE_REGISTRATIONS = Counter(
    'digestor_manager_instance_registrations_total',
    'Total Digestor instances registered'
)
DIGESTOR_GROUP_CREATIONS = Counter(
    'digestor_manager_group_creations_total',
    'Total groups created'
)
DIGESTOR_GROUP_QUERIES = Counter(
    'digestor_manager_group_queries_total',
    'Total group query operations'
)
DIGESTOR_DELETE_COUNTER = Counter(
    'digestor_manager_delete_documents_total',
    'Total deletion operations per instance'
)
DIGESTOR_GROUP_DELETE_COUNTER = Counter(
    'digestor_manager_delete_group_documents_total',
    'Total deletion operations per group'
)

class DigestorManager:
    """
    Central registry and orchestrator for Digestor instances.
    Provides get_or_create, thread-safe operations, and deletion metrics.
    """
    def __init__(self):
        self._instances: Dict[str, Digestor] = {}
        self._groups: Dict[str, List[str]] = {}
        self._lock = threading.RLock()
        log.info("DigestorManager initialized")

    def register_instance(self, instance_id: str, digestor: Digestor) -> None:
        """
        Register a Digestor under a unique ID.

        Raises:
            ValueError: if instance_id already exists.
        """
        with self._lock:
            if instance_id in self._instances:
                log.error("Attempt to re-register instance '%s'", instance_id)
                raise ValueError(f"Instance '{instance_id}' already registered")
            self._instances[instance_id] = digestor
            DIGESTOR_INSTANCE_REGISTRATIONS.inc()
            log.info("Registered Digestor instance '%s'", instance_id)

    def get_instance(self, instance_id: str) -> Digestor:
        """
        Retrieve a Digestor by ID.

        Raises:
            KeyError: if instance_id not found.
        """
        with self._lock:
            try:
                return self._instances[instance_id]
            except KeyError:
                log.error("Unknown Digestor instance '%s'", instance_id)
                raise KeyError(f"Unknown Digestor instance '{instance_id}'")

    def get_or_create(self, instance_id: str) -> Digestor:
        """
        Retrieve an existing Digestor or raise if missing.
        Note: for auto-creation, ensure instances are pre-registered.
        """
        # get_or_create mirrors get_instance behavior
        return self.get_instance(instance_id)

    def list_instances(self) -> List[str]:
        """
        List all registered Digestor IDs.
        """
        with self._lock:
            return list(self._instances.keys())

    def update_instance(self, instance_id: str, digestor: Digestor) -> None:
        """
        Replace an existing Digestor instance.

        Raises:
            KeyError: if instance_id not found.
        """
        with self._lock:
            if instance_id not in self._instances:
                log.error("Update failed, unknown instance '%s'", instance_id)
                raise KeyError(f"Instance '{instance_id}' not found")
            self._instances[instance_id] = digestor
            log.info("Updated Digestor instance '%s'", instance_id)

    def delete_instance(self, instance_id: str) -> None:
        """
        Remove an instance and clear its data.

        Raises:
            KeyError: if instance_id not found.
        """
        with self._lock:
            digestor = self._instances.get(instance_id)
            if not digestor:
                log.error("Delete failed, unknown instance '%s'", instance_id)
                raise KeyError(f"Unknown instance '{instance_id}'")
            try:
                digestor.clear()
                log.info("Cleared data for instance '%s'", instance_id)
            except Exception:
                log.exception("Failed clearing instance '%s'", instance_id)
            # remove from registry and groups
            del self._instances[instance_id]
            for members in self._groups.values():
                if instance_id in members:
                    members.remove(instance_id)

    def create_group(self, group_id: str, instance_ids: List[str]) -> None:
        """
        Define a new group of instances.

        Raises:
            ValueError: if group_id exists.
            KeyError: if any instance_id is unknown.
        """
        with self._lock:
            if group_id in self._groups:
                log.error("Group '%s' creation failed: already exists", group_id)
                raise ValueError(f"Group '{group_id}' already exists")
            for iid in instance_ids:
                if iid not in self._instances:
                    log.error(
                        "Group '%s' creation failed: unknown instance '%s'",
                        group_id,
                        iid,
                    )
                    raise KeyError(f"Instance '{iid}' not found")
            self._groups[group_id] = list(instance_ids)
            DIGESTOR_GROUP_CREATIONS.inc()
            log.info(
                "Created group '%s' with instances %s",
                group_id,
                instance_ids,
            )
    def delete_group(self, group_id: str) -> None:
        """
        Deletes a group definition from the manager.
        Does not delete the instances within the group.
    
        Raises:
            KeyError: if group_id not found.
        """
        with self._lock:
            if group_id not in self._groups:
                log.error("Delete group failed: unknown group '%s'", group_id)
                raise KeyError(f"Unknown group '{group_id}'")
            del self._groups[group_id]
            log.info("Deleted group '%s'", group_id)

    def list_groups(self) -> List[str]:
        """
        List all defined group IDs.
        """
        with self._lock:
            return list(self._groups.keys())

    def add_to_group(self, group_id: str, instance_id: str) -> None:
        """
        Add an existing instance to a group.

        Raises:
            KeyError: if group or instance not found.
        """
        with self._lock:
            if group_id not in self._groups:
                log.error("Add to group failed: unknown group '%s'", group_id)
                raise KeyError(f"Unknown group '{group_id}'")
            if instance_id not in self._instances:
                log.error(
                    "Add to group failed: unknown instance '%s'",
                    instance_id,
                )
                raise KeyError(f"Unknown instance '{instance_id}'")
            if instance_id not in self._groups[group_id]:
                self._groups[group_id].append(instance_id)
                log.info("Added instance '%s' to group '%s'", instance_id, group_id)

    def remove_from_group(self, group_id: str, instance_id: str) -> None:
        """
        Remove an instance from a specified group.

        Raises:
            KeyError: if group or instance not found.
        """
        with self._lock:
            if (
                group_id not in self._groups
                or instance_id not in self._groups[group_id]
            ):
                log.error(
                    "Remove from group failed: '%s' or '%s' not found",
                    group_id,
                    instance_id,
                )
                raise KeyError(
                    f"Group '{group_id}' or instance '{instance_id}' not found"
                )
            self._groups[group_id].remove(instance_id)
            log.info(
                "Removed instance '%s' from group '%s'",
                instance_id,
                group_id,
            )

    def get_group(self, group_id: str) -> List[Digestor]:
        """
        Retrieve Digestor instances for the given group.

        Raises:
            KeyError: if group not found.
        """
        with self._lock:
            if group_id not in self._groups:
                log.error("Unknown group '%s' requested", group_id)
                raise KeyError(f"Unknown group '{group_id}'")
            return [self._instances[iid] for iid in self._groups[group_id]]

    def query_instance(self, instance_id: str, text: str, k: int = 5) -> List[Dict[str, Any]]:
        """
        Query a single Digestor instance.
        """
        digestor = self.get_instance(instance_id)
        return digestor.query(text, k)

    def query_group(
        self,
        group_id: str,
        text: str,
        k_per_instance: int = 3,
        top_k: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Query all instances in a group and merge results.
        """
        DIGESTOR_GROUP_QUERIES.inc()
        instances = self.get_group(group_id)
        all_results: List[Dict[str, Any]] = []
        for inst in instances:
            try:
                all_results.extend(inst.query(text, k_per_instance))
            except Exception:
                log.exception(
                    "Query failed for instance in group '%s'", group_id
                )
        sorted_results = sorted(
            all_results,
            key=lambda entry: entry.get('score', 0),
            reverse=True,
        )
        return sorted_results[:top_k] if top_k else sorted_results

    def clear_group(self, group_id: str) -> None:
        """
        Clear data of all instances in a group.

        Raises:
            KeyError: if group not found.
        """
        instances = self.get_group(group_id)
        for inst in instances:
            try:
                inst.clear()
            except Exception:
                log.exception(
                    "Failed to clear instance in group '%s'", group_id
                )
        log.info("Cleared all instances in group '%s'", group_id)

    def clear_all(self) -> None:
        """
        Clear all instances and groups, resetting manager state.
        """
        with self._lock:
            for instance_id, inst in list(self._instances.items()):
                try:
                    inst.clear()
                except Exception:
                    log.exception("Failed to clear instance '%s'", instance_id)
            self._instances.clear()
            self._groups.clear()
        log.info("Cleared all DigestorManager state")

    def delete_documents(self, instance_id: str, filters: Dict[str, Any]) -> int:
        """
        Delete documents on a specific Digestor instance.

        Returns:
            Number of documents deleted.
        """
        with self._lock:
            DIGESTOR_DELETE_COUNTER.inc()
            try:
                d = self.get_or_create(instance_id)
                return d.delete_documents(filters)
            except KeyError as err:
                log.error("Delete failed: %s", err)
                raise

    def delete_group_documents(self, group_id: str, filters: Dict[str, Any]) -> int:
        """
        Delete documents across all Digestors in a group.

        Returns:
            Total number of documents deleted.
        """
        with self._lock:
            DIGESTOR_GROUP_DELETE_COUNTER.inc()
            total = 0
            for d in self.get_group(group_id):
                total += d.delete_documents(filters)
            return total

