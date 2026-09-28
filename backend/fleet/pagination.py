from rest_framework.pagination import PageNumberPagination


class FleetPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 5000  # lets "export current filtered view" fetch it all in one call
